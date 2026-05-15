const Invoice         = require('../models/Invoice.model');
const TrustAccount    = require('../models/TrustAccount.model');
const TrustTransaction= require('../models/TrustTransaction.model');
const TimeEntry       = require('../models/TimeEntry.model');
const Matter          = require('../models/Matter.model');
const Contact         = require('../models/Contact.model');
const { sendSuccess, sendError } = require('../utils/response');

/* ── Invoices ──────────────────────────────────────────────────── */
exports.listInvoices = async (req, res) => {
  const { status, matterId, clientId, from, to, limit = 100 } = req.query;
  const filter = { firmId: req.user._id };
  if (status)   filter.status   = status;
  if (matterId) filter.matterId = matterId;
  if (clientId) filter.clientId = clientId;
  if (from || to) {
    filter.issueDate = {};
    if (from) filter.issueDate.$gte = new Date(from);
    if (to)   filter.issueDate.$lte = new Date(to);
  }
  const invoices = await Invoice.find(filter)
    .populate('matterId', 'title matterNumber')
    .populate('clientId', 'firstName lastName company email')
    .sort({ createdAt: -1 }).limit(Number(limit)).lean();

  // Summary stats
  const total     = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const collected = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const outstanding = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + (i.total || 0), 0);
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;

  sendSuccess(res, { invoices, stats: { total, collected, outstanding, overdueCount } }, 'Invoices fetched');
};

exports.getInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('matterId', 'title matterNumber')
    .populate('clientId', 'firstName lastName company email phone address')
    .lean();
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  sendSuccess(res, invoice, 'Invoice fetched');
};

exports.createInvoice = async (req, res) => {
  const invoice = await Invoice.create({ ...req.body, firmId: req.user._id });
  sendSuccess(res, invoice, 'Invoice created', 201);
};

exports.updateInvoice = async (req, res) => {
  const invoice = await Invoice.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  sendSuccess(res, invoice, 'Invoice updated');
};

exports.deleteInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: req.user._id });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  if (invoice.status === 'paid') return sendError(res, 'Cannot delete a paid invoice', 400);
  await invoice.deleteOne();
  sendSuccess(res, null, 'Invoice deleted');
};

exports.sendInvoice = async (req, res) => {
  const invoice = await Invoice.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id, status: { $in: ['draft','sent'] } },
    { status: 'sent', sentAt: new Date() },
    { new: true }
  );
  if (!invoice) return sendError(res, 'Invoice not found or already processed', 404);
  // In production: send email via nodemailer/sendgrid
  sendSuccess(res, invoice, 'Invoice sent to client');
};

exports.markPaid = async (req, res) => {
  const { paymentMethod = 'Bank Transfer', paymentNotes } = req.body;
  const invoice = await Invoice.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id, status: { $in: ['sent','overdue','draft'] } },
    { status: 'paid', paymentDate: new Date(), paymentMethod, paymentNotes },
    { new: true }
  );
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  sendSuccess(res, invoice, 'Invoice marked as paid');
};

exports.generateFromMatter = async (req, res) => {
  const { matterId } = req.body;
  const matter = await Matter.findOne({ _id: matterId, firmId: req.user._id })
    .populate('clientId').lean();
  if (!matter) return sendError(res, 'Matter not found', 404);

  // Pull unbilled time entries
  const entries = await TimeEntry.find({
    matterId, firmId: req.user._id, isBillable: true, isBilled: false,
  }).lean();

  const lineItems = entries.length > 0
    ? entries.map(e => ({ description: e.description || e.activityType, quantity: e.hours, rate: e.rate, amount: e.amount }))
    : [{ description: `Legal services — ${matter.title}`, quantity: 1, rate: matter.hourlyRate || 0, amount: matter.hourlyRate || 0 }];

  const invoice = await Invoice.create({
    firmId: req.user._id,
    matterId,
    clientId:   matter.clientId?._id,
    clientName: matter.clientId ? [matter.clientId.firstName, matter.clientId.lastName].filter(Boolean).join(' ') : matter.clientName,
    lineItems,
    dueDate: new Date(Date.now() + 30 * 86400000),
  });

  // Mark time entries as billed
  if (entries.length > 0) {
    await TimeEntry.updateMany(
      { _id: { $in: entries.map(e => e._id) } },
      { isBilled: true, invoiceId: invoice._id }
    );
  }

  sendSuccess(res, invoice, 'Invoice generated from matter', 201);
};

exports.createPaymentLink = async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, firmId: req.user._id });
  if (!invoice) return sendError(res, 'Invoice not found', 404);
  // In production: integrate with Stripe/JazzCash/EasyPaisa
  const mockLink = `https://pay.nyayalaw.pk/invoice/${invoice.invoiceNumber}`;
  invoice.paymentLink = mockLink;
  await invoice.save();
  sendSuccess(res, { paymentLink: mockLink }, 'Payment link created');
};

/* ── Trust Accounting ──────────────────────────────────────────── */
exports.listTrustAccounts = async (req, res) => {
  let accounts = await TrustAccount.find({ firmId: req.user._id, isActive: true }).lean();
  if (accounts.length === 0) {
    // Auto-create default trust account
    const acc = await TrustAccount.create({ firmId: req.user._id, accountName: 'Client Trust Account' });
    accounts = [acc.toObject()];
  }
  // Attach recent transactions to each account
  const withTx = await Promise.all(accounts.map(async acc => {
    const transactions = await TrustTransaction.find({ trustAccountId: acc._id })
      .sort({ date: -1 }).limit(10).lean();
    return { ...acc, transactions };
  }));
  sendSuccess(res, withTx, 'Trust accounts fetched');
};

exports.trustDeposit = async (req, res) => {
  const trustAccountId = req.params.accountId;
  const { amount, description, matterId, date } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const account = await TrustAccount.findOne({ _id: trustAccountId, firmId: req.user._id });
  if (!account) return sendError(res, 'Trust account not found', 404);

  account.balance = +(account.balance + amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId, firmId: req.user._id, matterId,
    type: 'deposit', amount, description,
    date: date || new Date(), balanceAfter: account.balance, performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Deposit recorded', 201);
};

exports.trustTransfer = async (req, res) => {
  const trustAccountId = req.params.accountId;
  const { amount, description, matterId } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const account = await TrustAccount.findOne({ _id: trustAccountId, firmId: req.user._id });
  if (!account) return sendError(res, 'Trust account not found', 404);
  if (account.balance < amount) return sendError(res, 'Insufficient trust balance', 400);

  account.balance = +(account.balance - amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId, firmId: req.user._id, matterId,
    type: 'transfer_to_operating', amount, description,
    date: new Date(), balanceAfter: account.balance, performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Transfer recorded', 201);
};

exports.reconciliation = async (req, res) => {
  const { from, to } = req.query;
  const account = await TrustAccount.findOne({ _id: req.params.accountId, firmId: req.user._id }).lean();
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
