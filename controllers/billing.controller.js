const Invoice         = require('../models/Invoice.model');
const CreditNote      = require('../models/CreditNote.model');
const TrustAccount    = require('../models/TrustAccount.model');
const TrustTransaction= require('../models/TrustTransaction.model');
const TimeEntry       = require('../models/TimeEntry.model');
const Expense         = require('../models/Expense.model');
const Matter          = require('../models/Matter.model');
const crypto          = require('crypto');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = (req) => req.user.firmId || req.user._id;

/* ── List Invoices ─────────────────────────────────────────────── */
exports.listInvoices = async (req, res) => {
  const { status, matterId, clientId, from, to, search, limit = 50, skip = 0 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isDeleted: { $ne: true } };
  if (status)   filter.status   = status;
  if (matterId) filter.matterId = matterId;
  if (clientId) filter.clientId = clientId;
  if (from || to) {
    filter.issueDate = {};
    if (from) filter.issueDate.$gte = new Date(from);
    if (to)   filter.issueDate.$lte = new Date(to);
  }
  if (search) filter.$or = [
    { invoiceNumber: { $regex: search, $options: 'i' } },
    { clientName:    { $regex: search, $options: 'i' } },
  ];

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('matterId', 'title matterNumber')
      .populate('clientId', 'firstName lastName company')
      .sort({ issueDate: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  const allInvoices = await Invoice.find({ firmId, isDeleted: { $ne: true } })
    .select('total amountPaid amountOutstanding status').lean();
  const totalBilled      = +allInvoices.reduce((s, i) => s + (i.total || 0), 0).toFixed(2);
  const totalCollected   = +allInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0).toFixed(2);
  const totalOutstanding = +allInvoices.reduce((s, i) => s + (Math.max(0, i.amountOutstanding || 0)), 0).toFixed(2);
  const overdueCount     = allInvoices.filter(i => i.status === 'overdue').length;

  sendSuccess(res, { invoices, total, totalBilled, totalCollected, totalOutstanding, overdueCount }, 'Invoices fetched');
};

exports.getInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } })
    .populate('matterId', 'title matterNumber billingType')
    .populate('clientId', 'firstName lastName company email addresses')
    .lean();
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  sendSuccess(res, invoice, 'Invoice fetched');
};

/* ── Create (manual) ───────────────────────────────────────────── */
exports.createInvoice = async (req, res) => {
  const invoice = await Invoice.create({ ...req.body, firmId: getFirmId(req) });
  sendSuccess(res, invoice, 'Invoice created', 201);
};

/* ── Generate from Matter ──────────────────────────────────────── */
exports.generateFromMatter = async (req, res) => {
  const { matterId, taxLines, discountType, discountValue, dueDate, notes, terms, trustApplied } = req.body;
  const firmId = getFirmId(req);

  const matter = await Matter.findOne({ _id: matterId, firmId, isDeleted: { $ne: true } })
    .populate('clientId', 'firstName lastName company email addresses').lean();
  if (!matter) return sendError(res, 'Matter not found', 404);

  const [entries, expenses] = await Promise.all([
    TimeEntry.find({ firmId, matterId, isBillable: true, isBilled: false, isDeleted: { $ne: true } }).lean(),
    Expense.find(   { firmId, matterId, isBillable: true, isBilled: false, isDeleted: { $ne: true } }).lean(),
  ]);

  const lineItems = [
    ...entries.map(e => ({
      type: 'time_entry', sourceId: e._id,
      description: e.description || `${e.activityType} services`,
      date: e.date, quantity: e.hours, rate: e.rate, amount: +(e.amount || 0),
    })),
    ...expenses.map(e => ({
      type: 'expense', sourceId: e._id,
      description: e.description, date: e.date,
      quantity: 1, rate: e.amount, amount: +(e.amount || 0),
    })),
  ];

  if (!lineItems.length) return sendError(res, 'No unbilled time entries or expenses for this matter', 400);

  const client = matter.clientId;
  const primaryAddr = client?.addresses?.find(a => a.isPrimary) || client?.addresses?.[0];

  const invoice = await Invoice.create({
    firmId, matterId,
    clientId:      client?._id,
    clientName:    client ? (`${client.firstName || ''} ${client.lastName || ''}`.trim() || client.company) : '',
    clientEmail:   client?.email,
    clientAddress: primaryAddr,
    lineItems, taxLines: taxLines || [],
    discountType, discountValue,
    dueDate: dueDate || new Date(Date.now() + 30 * 86400000),
    notes, terms, trustApplied: trustApplied || 0,
  });

  const entryIds   = entries.map(e => e._id);
  const expenseIds = expenses.map(e => e._id);
  if (entryIds.length)   await TimeEntry.updateMany({ _id: { $in: entryIds } },   { isBilled: true, invoiceId: invoice._id });
  if (expenseIds.length) await Expense.updateMany(  { _id: { $in: expenseIds } }, { isBilled: true, invoiceId: invoice._id });

  sendSuccess(res, invoice, 'Invoice generated', 201);
};

/* ── Batch Generate ────────────────────────────────────────────── */
exports.batchGenerate = async (req, res) => {
  const { matterIds = [], dueDate, taxLines } = req.body;
  const firmId  = getFirmId(req);
  const results = [];

  for (const matterId of matterIds) {
    try {
      const [entries, expenses] = await Promise.all([
        TimeEntry.find({ firmId, matterId, isBillable: true, isBilled: false, isDeleted: { $ne: true } }).lean(),
        Expense.find(  { firmId, matterId, isBillable: true, isBilled: false, isDeleted: { $ne: true } }).lean(),
      ]);
      if (!entries.length && !expenses.length) continue;

      const matter = await Matter.findById(matterId).populate('clientId', 'firstName lastName company email').lean();
      const client = matter?.clientId;
      const lineItems = [
        ...entries.map(e => ({ type: 'time_entry', sourceId: e._id, description: e.description || 'Legal services', date: e.date, quantity: e.hours, rate: e.rate, amount: +(e.amount || 0) })),
        ...expenses.map(e => ({ type: 'expense', sourceId: e._id, description: e.description, date: e.date, quantity: 1, rate: e.amount, amount: +(e.amount || 0) })),
      ];

      const invoice = await Invoice.create({
        firmId, matterId, clientId: client?._id,
        clientName: client ? (`${client.firstName || ''} ${client.lastName || ''}`.trim() || client.company) : '',
        clientEmail: client?.email,
        lineItems, taxLines: taxLines || [],
        dueDate: dueDate || new Date(Date.now() + 30 * 86400000),
      });

      const eIds = entries.map(e => e._id);
      const xIds = expenses.map(e => e._id);
      if (eIds.length) await TimeEntry.updateMany({ _id: { $in: eIds } }, { isBilled: true, invoiceId: invoice._id });
      if (xIds.length) await Expense.updateMany(  { _id: { $in: xIds } }, { isBilled: true, invoiceId: invoice._id });

      results.push({ matterId, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber });
    } catch (err) {
      results.push({ matterId, error: err.message });
    }
  }

  sendSuccess(res, { results, generated: results.filter(r => !r.error).length }, 'Batch generation complete');
};

/* ── Update (draft only) ───────────────────────────────────────── */
exports.updateInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  if (invoice.status !== 'draft') return sendError(res, 'Only draft invoices can be edited', 400);
  Object.assign(invoice, req.body);
  await invoice.save();
  sendSuccess(res, invoice, 'Invoice updated');
};

/* ── Delete (draft only) ───────────────────────────────────────── */
exports.deleteInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  if (invoice.status !== 'draft') return sendError(res, 'Only draft invoices can be deleted', 400);
  invoice.isDeleted = true;
  await invoice.save();
  sendSuccess(res, null, 'Invoice deleted');
};

/* ── Send ──────────────────────────────────────────────────────── */
exports.sendInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  if (invoice.status === 'void') return sendError(res, 'Cannot send a voided invoice', 400);
  if (!invoice.paymentToken) invoice.paymentToken = crypto.randomBytes(24).toString('hex');
  invoice.status = 'sent';
  invoice.sentAt = new Date();
  await invoice.save();
  sendSuccess(res, invoice, 'Invoice sent');
};

/* ── Mark Paid (offline) ───────────────────────────────────────── */
exports.markPaid = async (req, res) => {
  const { amount, method, transactionId, notes, date } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Valid payment amount required', 400);

  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  if (invoice.status === 'void') return sendError(res, 'Cannot record payment on voided invoice', 400);

  invoice.payments.push({ amount, method: method || 'other', transactionId, notes, date: date || new Date() });
  await invoice.save();

  if (invoice.amountOutstanding <= 0) {
    invoice.status = 'paid';
    invoice.paidAt = new Date();
    // Auto-post accounting entry: DR Cash, CR AR
    require('./accounting.controller').postFromInvoice(
      invoice.firmId, invoice._id, amount
    ).catch(() => {});
  } else if (invoice.amountPaid > 0) {
    invoice.status = 'partially_paid';
  }
  await invoice.save();

  sendSuccess(res, invoice, 'Payment recorded');
};

/* ── Void ──────────────────────────────────────────────────────── */
exports.voidInvoice = async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return sendError(res, 'Void reason required', 400);

  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  if (invoice.status === 'void') return sendError(res, 'Invoice is already voided', 400);

  const timeIds    = invoice.lineItems.filter(li => li.type === 'time_entry').map(li => li.sourceId);
  const expenseIds = invoice.lineItems.filter(li => li.type === 'expense').map(li => li.sourceId);
  if (timeIds.length)    await TimeEntry.updateMany({ _id: { $in: timeIds } },    { isBilled: false, invoiceId: null });
  if (expenseIds.length) await Expense.updateMany(  { _id: { $in: expenseIds } }, { isBilled: false, invoiceId: null });

  invoice.status     = 'void';
  invoice.voidedAt   = new Date();
  invoice.voidReason = reason;
  await invoice.save();

  sendSuccess(res, invoice, 'Invoice voided');
};

/* ── Write-Off ─────────────────────────────────────────────────── */
exports.writeOff = async (req, res) => {
  const { amount, reason } = req.body;
  if (!reason?.trim()) return sendError(res, 'Write-off reason required', 400);

  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  if (invoice.isWrittenOff) return sendError(res, 'Invoice already written off', 400);

  invoice.isWrittenOff   = true;
  invoice.writeOffAmount = amount || invoice.amountOutstanding;
  invoice.writeOffReason = reason;
  invoice.writeOffAt     = new Date();
  await invoice.save();

  sendSuccess(res, invoice, 'Invoice written off');
};

/* ── Payment Link ──────────────────────────────────────────────── */
exports.generatePaymentLink = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);

  if (!invoice.paymentToken) {
    invoice.paymentToken = crypto.randomBytes(24).toString('hex');
  }
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  invoice.paymentLink = `${baseUrl}/pay/${invoice.paymentToken}`;
  await invoice.save();

  sendSuccess(res, { paymentLink: invoice.paymentLink, paymentToken: invoice.paymentToken }, 'Payment link generated');
};

/* ── Payment Plan ──────────────────────────────────────────────── */
exports.createPaymentPlan = async (req, res) => {
  const { installments } = req.body;
  if (!Array.isArray(installments) || !installments.length) return sendError(res, 'installments array required', 400);

  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);

  invoice.paymentPlan = { installments: installments.map(i => ({ dueDate: i.dueDate, amount: i.amount, status: 'pending' })) };
  await invoice.save();
  sendSuccess(res, invoice, 'Payment plan created');
};

/* ── Send Reminder ─────────────────────────────────────────────── */
exports.sendReminder = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);

  invoice.remindersSent.push({ type: req.body.type || 'manual', sentAt: new Date() });
  await invoice.save();
  // TODO: trigger email via notification service
  sendSuccess(res, invoice, 'Reminder sent');
};

/* ── Credit Notes ──────────────────────────────────────────────── */
exports.issueCreditNote = async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || !reason?.trim()) return sendError(res, 'amount and reason required', 400);

  const firmId  = getFirmId(req);
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);

  const creditNote = await CreditNote.create({ firmId, invoiceId: invoice._id, clientId: invoice.clientId, amount, reason });
  sendSuccess(res, creditNote, 'Credit note issued', 201);
};

exports.listCreditNotes = async (req, res) => {
  const notes = await CreditNote.find({ firmId: getFirmId(req) })
    .populate('invoiceId', 'invoiceNumber clientName').sort({ createdAt: -1 }).lean();
  sendSuccess(res, notes, 'Credit notes fetched');
};

/* ── Public Invoice (no auth) ──────────────────────────────────── */
exports.getPublicInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({ paymentToken: req.params.token, isDeleted: { $ne: true } })
    .populate('matterId', 'title').lean();
  if (!invoice || invoice.status === 'void') return sendError(res, 'Invoice not found', 404);

  sendSuccess(res, {
    invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate,
    clientName: invoice.clientName, matterId: invoice.matterId,
    lineItems: invoice.lineItems, subtotal: invoice.subtotal, totalTax: invoice.totalTax,
    discountAmount: invoice.discountAmount, total: invoice.total,
    amountPaid: invoice.amountPaid, amountOutstanding: invoice.amountOutstanding,
    status: invoice.status, notes: invoice.notes, terms: invoice.terms,
  }, 'Invoice fetched');
};

exports.submitPayment = async (req, res) => {
  const invoice = await Invoice.findOne({ paymentToken: req.params.token, isDeleted: { $ne: true } });
  if (!invoice || invoice.status === 'void') return sendError(res, 'Invoice not found', 404);
  if (invoice.amountOutstanding <= 0) return sendError(res, 'Invoice already paid', 400);

  const { amount, method, transactionId } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Valid payment amount required', 400);

  invoice.payments.push({ amount, method: method || 'credit_card', transactionId });
  await invoice.save();

  invoice.status = invoice.amountOutstanding <= 0 ? 'paid' : 'partially_paid';
  if (invoice.status === 'paid') invoice.paidAt = new Date();
  await invoice.save();

  sendSuccess(res, { status: invoice.status, amountOutstanding: invoice.amountOutstanding }, 'Payment recorded');
};

/* ── Stripe Webhook (no auth, public) ─────────────────────────── */
exports.stripeWebhook = async (req, res) => {
  // TODO: verify Stripe-Signature header and handle events
  // payment_intent.succeeded → markPaid, charge.refunded → record refund
  res.json({ received: true });
};

/* ── Trust Accounting ──────────────────────────────────────────── */
exports.listTrustAccounts = async (req, res) => {
  let accounts = await TrustAccount.find({ firmId: getFirmId(req), isActive: true }).lean();
  if (accounts.length === 0) {
    const acc = await TrustAccount.create({ firmId: getFirmId(req), accountName: 'Client Trust Account' });
    accounts = [acc.toObject()];
  }
  const withTx = await Promise.all(accounts.map(async acc => {
    const transactions = await TrustTransaction.find({ trustAccountId: acc._id }).sort({ date: -1 }).limit(10).lean();
    return { ...acc, transactions };
  }));
  sendSuccess(res, withTx, 'Trust accounts fetched');
};

exports.trustDeposit = async (req, res) => {
  const { amount, description, matterId, date } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const account = await TrustAccount.findOne({ _id: req.params.accountId, firmId: getFirmId(req) });
  if (!account) return sendError(res, 'Trust account not found', 404);

  account.balance = +(account.balance + amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId: account._id, firmId: getFirmId(req), matterId,
    type: 'deposit', amount, description,
    date: date || new Date(), balanceAfter: account.balance, performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Deposit recorded', 201);
};

exports.trustTransfer = async (req, res) => {
  const { amount, description, matterId } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const account = await TrustAccount.findOne({ _id: req.params.accountId, firmId: getFirmId(req) });
  if (!account) return sendError(res, 'Trust account not found', 404);
  if (account.balance < amount) return sendError(res, 'Insufficient trust balance', 400);

  account.balance = +(account.balance - amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId: account._id, firmId: getFirmId(req), matterId,
    type: 'transfer_to_operating', amount, description,
    date: new Date(), balanceAfter: account.balance, performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Transfer recorded', 201);
};

exports.reconciliation = async (req, res) => {
  const { from, to } = req.query;
  const account = await TrustAccount.findOne({ _id: req.params.accountId, firmId: getFirmId(req) }).lean();
  if (!account) return sendError(res, 'Trust account not found', 404);

  const txFilter = { trustAccountId: req.params.accountId };
  if (from || to) {
    txFilter.date = {};
    if (from) txFilter.date.$gte = new Date(from);
    if (to)   txFilter.date.$lte = new Date(to);
  }
  const transactions = await TrustTransaction.find(txFilter)
    .populate('matterId', 'title matterNumber').sort({ date: 1 }).lean();

  const deposits  = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
  const transfers = transactions.filter(t => t.type !== 'deposit').reduce((s, t) => s + t.amount, 0);

  sendSuccess(res, { account, transactions, deposits, transfers, netChange: deposits - transfers }, 'Reconciliation fetched');
};
