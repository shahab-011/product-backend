const crypto                 = require('crypto');
const TrustAccount           = require('../models/TrustAccount.model');
const TrustTransaction       = require('../models/TrustTransaction.model');
const TrustPaymentRequest    = require('../models/TrustPaymentRequest.model');
const FirmSettings           = require('../models/FirmSettings.model');
const { sendSuccess, sendError } = require('../utils/response');
const { sendTrustPaymentRequest } = require('../utils/email');

const getFirmId = (req) => req.user.firmId || req.user._id;

/* ── Accounts ──────────────────────────────────────────────────── */
exports.listTrustAccounts = async (req, res) => {
  const firmId = getFirmId(req);
  let accounts = await TrustAccount.find({ firmId, isActive: true }).lean();
  if (!accounts.length) {
    const acc = await TrustAccount.create({ firmId, accountName: 'Client Trust Account', isDefault: true });
    accounts = [acc.toObject()];
  }
  sendSuccess(res, accounts, 'Trust accounts fetched');
};

exports.createTrustAccount = async (req, res) => {
  const firmId = getFirmId(req);
  const account = await TrustAccount.create({ ...req.body, firmId });
  sendSuccess(res, account, 'Trust account created', 201);
};

exports.updateTrustAccount = async (req, res) => {
  const account = await TrustAccount.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    req.body,
    { new: true, runValidators: true }
  );
  if (!account) return sendError(res, 'Trust account not found', 404);
  sendSuccess(res, account, 'Trust account updated');
};

/* ── Account Ledger ────────────────────────────────────────────── */
exports.getAccountLedger = async (req, res) => {
  const { from, to, type, limit = 200 } = req.query;
  const firmId  = getFirmId(req);
  const account = await TrustAccount.findOne({ _id: req.params.id, firmId }).lean();
  if (!account) return sendError(res, 'Trust account not found', 404);

  const filter = { trustAccountId: req.params.id, isVoided: { $ne: true } };
  if (type) filter.type = type;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const transactions = await TrustTransaction.find(filter)
    .populate('matterId', 'title matterNumber')
    .populate('clientId', 'firstName lastName company')
    .populate('performedBy', 'name')
    .sort({ date: -1 })
    .limit(Number(limit))
    .lean();

  const deposits      = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
  const disbursements = transactions.filter(t => t.type === 'disbursement').reduce((s, t) => s + t.amount, 0);
  const transfers     = transactions.filter(t => t.type === 'transfer_to_operating').reduce((s, t) => s + t.amount, 0);
  const refunds       = transactions.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0);

  sendSuccess(res, { account, transactions, deposits, disbursements, transfers, refunds }, 'Account ledger fetched');
};

/* ── Matter Ledger ─────────────────────────────────────────────── */
exports.getMatterLedger = async (req, res) => {
  const { id: trustAccountId, matterId } = req.params;
  const firmId = getFirmId(req);

  const account = await TrustAccount.findOne({ _id: trustAccountId, firmId }).lean();
  if (!account) return sendError(res, 'Trust account not found', 404);

  const transactions = await TrustTransaction.find({ trustAccountId, matterId, isVoided: { $ne: true } })
    .populate('performedBy', 'name')
    .sort({ date: 1 })
    .lean();

  // Running balance for this matter
  let runningBalance = 0;
  const ledger = transactions.map(tx => {
    const sign = ['deposit'].includes(tx.type) ? 1 : -1;
    runningBalance = +(runningBalance + sign * tx.amount).toFixed(2);
    return { ...tx, matterBalance: runningBalance };
  });

  const matterBalance = runningBalance;

  sendSuccess(res, { account, matterId, ledger, matterBalance }, 'Matter ledger fetched');
};

/* ── Transactions ──────────────────────────────────────────────── */
exports.listTransactions = async (req, res) => {
  const { from, to, type, matterId, limit = 200, skip = 0 } = req.query;
  const firmId = getFirmId(req);

  const filter = { firmId };
  if (req.params.id)  filter.trustAccountId = req.params.id;
  if (type)           filter.type           = type;
  if (matterId)       filter.matterId       = matterId;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const [transactions, total] = await Promise.all([
    TrustTransaction.find(filter)
      .populate('matterId',  'title matterNumber')
      .populate('clientId',  'firstName lastName company')
      .populate('performedBy', 'name')
      .sort({ date: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean(),
    TrustTransaction.countDocuments(filter),
  ]);

  sendSuccess(res, { transactions, total }, 'Transactions fetched');
};

/* ── Record Deposit ────────────────────────────────────────────── */
exports.recordDeposit = async (req, res) => {
  const { amount, description, matterId, clientId, date, checkNumber } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const firmId  = getFirmId(req);
  const account = await TrustAccount.findOne({ _id: req.params.id, firmId });
  if (!account) return sendError(res, 'Trust account not found', 404);

  account.balance = +(account.balance + amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId: account._id, firmId, matterId, clientId,
    type: 'deposit', amount, description, checkNumber,
    date: date || new Date(), balanceAfter: account.balance,
    performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Deposit recorded', 201);
};

/* ── Record Disbursement ───────────────────────────────────────── */
exports.recordDisbursement = async (req, res) => {
  const { amount, description, matterId, clientId, payee, date, checkNumber } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const firmId  = getFirmId(req);
  const account = await TrustAccount.findOne({ _id: req.params.id, firmId });
  if (!account) return sendError(res, 'Trust account not found', 404);
  if (account.balance < amount) return sendError(res, 'Insufficient trust balance', 400);

  account.balance = +(account.balance - amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId: account._id, firmId, matterId, clientId, payee,
    type: 'disbursement', amount, description, checkNumber,
    date: date || new Date(), balanceAfter: account.balance,
    performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Disbursement recorded', 201);
};

/* ── Transfer to Operating ─────────────────────────────────────── */
exports.transferToOperating = async (req, res) => {
  const { amount, description, matterId, relatedInvoiceId } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const firmId  = getFirmId(req);
  const account = await TrustAccount.findOne({ _id: req.params.id, firmId });
  if (!account) return sendError(res, 'Trust account not found', 404);
  if (account.balance < amount) return sendError(res, 'Insufficient trust balance', 400);

  account.balance = +(account.balance - amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId: account._id, firmId, matterId, relatedInvoiceId,
    type: 'transfer_to_operating', amount, description,
    date: new Date(), balanceAfter: account.balance,
    performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Transfer recorded', 201);
};

/* ── Record Refund ─────────────────────────────────────────────── */
exports.recordRefund = async (req, res) => {
  const { amount, description, matterId, clientId, payee, date } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'Invalid amount', 400);

  const firmId  = getFirmId(req);
  const account = await TrustAccount.findOne({ _id: req.params.id, firmId });
  if (!account) return sendError(res, 'Trust account not found', 404);
  if (account.balance < amount) return sendError(res, 'Insufficient trust balance', 400);

  account.balance = +(account.balance - amount).toFixed(2);
  await account.save();

  const tx = await TrustTransaction.create({
    trustAccountId: account._id, firmId, matterId, clientId, payee,
    type: 'refund', amount, description,
    date: date || new Date(), balanceAfter: account.balance,
    performedBy: req.user._id,
  });
  sendSuccess(res, { transaction: tx, newBalance: account.balance }, 'Refund recorded', 201);
};

/* ── Void Transaction ──────────────────────────────────────────── */
exports.voidTransaction = async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return sendError(res, 'Void reason required', 400);

  const firmId = getFirmId(req);
  const tx = await TrustTransaction.findOne({ _id: req.params.txId, firmId });
  if (!tx) return sendError(res, 'Transaction not found', 404);
  if (tx.isVoided) return sendError(res, 'Transaction already voided', 400);

  const account = await TrustAccount.findById(tx.trustAccountId);
  if (account) {
    // Reverse the effect
    const sign = tx.type === 'deposit' ? -1 : 1;
    account.balance = +(account.balance + sign * tx.amount).toFixed(2);
    await account.save();
  }

  tx.isVoided  = true;
  tx.voidedAt  = new Date();
  tx.voidReason = reason;
  await tx.save();

  sendSuccess(res, tx, 'Transaction voided');
};

/* ── Three-Way Reconciliation ──────────────────────────────────── */
exports.performReconciliation = async (req, res) => {
  const { bankBalance, notes } = req.body;
  if (bankBalance === undefined) return sendError(res, 'bankBalance required', 400);

  const firmId  = getFirmId(req);
  const account = await TrustAccount.findOne({ _id: req.params.id, firmId });
  if (!account) return sendError(res, 'Trust account not found', 404);

  // Ledger total = system running balance
  const ledgerTotal       = account.balance;
  const reconciledBalance = account.balance;
  const isBalanced        = Math.abs(parseFloat(bankBalance) - reconciledBalance) < 0.01;

  account.reconciliations.push({
    date: new Date(), bankBalance: parseFloat(bankBalance),
    reconciledBalance, ledgerTotal,
    isBalanced, notes: notes || '',
    performedBy: req.user._id,
  });
  await account.save();

  sendSuccess(res, {
    bankBalance: parseFloat(bankBalance),
    reconciledBalance,
    ledgerTotal,
    isBalanced,
    difference: +(parseFloat(bankBalance) - reconciledBalance).toFixed(2),
  }, isBalanced ? 'Reconciliation passed' : 'Reconciliation has discrepancies');
};

/* ── Reconciliation Report ─────────────────────────────────────── */
exports.getReconciliationReport = async (req, res) => {
  const firmId  = getFirmId(req);
  const account = await TrustAccount.findOne({ _id: req.params.id, firmId })
    .populate('reconciliations.performedBy', 'name').lean();
  if (!account) return sendError(res, 'Trust account not found', 404);
  sendSuccess(res, { account, reconciliations: account.reconciliations || [] }, 'Reconciliation report fetched');
};

/* ── Trust Payment Requests ────────────────────────────────────── */
exports.requestPayment = async (req, res) => {
  const firmId = getFirmId(req);
  const { amount, description, clientEmail, clientName, matterId, message } = req.body;
  if (!amount || !clientEmail) return sendError(res, 'amount and clientEmail required', 400);

  const account = await TrustAccount.findOne({ _id: req.params.id, firmId }).lean();
  if (!account) return sendError(res, 'Trust account not found', 404);

  const settings  = await FirmSettings.findOne({ firmId }).lean();
  const firmName  = settings?.name || 'Your Law Firm';
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const request = await TrustPaymentRequest.create({
    firmId, trustAccountId: account._id, matterId: matterId || undefined,
    requestedBy: req.user._id, clientEmail, clientName,
    amount: parseFloat(amount), description, message, token, expiresAt,
  });

  const payUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/trust-pay/${token}`;

  try {
    await sendTrustPaymentRequest(clientEmail, clientName || 'Client', {
      firmName, amount: parseFloat(amount), description, message, payUrl,
      accountName: account.accountName,
    });
  } catch (e) {
    console.error('Trust payment email failed:', e.message);
  }

  sendSuccess(res, { request, payUrl }, 'Payment request sent');
};

exports.listPaymentRequests = async (req, res) => {
  const firmId   = getFirmId(req);
  const requests = await TrustPaymentRequest.find({ firmId, trustAccountId: req.params.id })
    .populate('matterId', 'title matterNumber')
    .populate('requestedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, requests, 'Payment requests fetched');
};

exports.cancelPaymentRequest = async (req, res) => {
  const firmId  = getFirmId(req);
  const request = await TrustPaymentRequest.findOneAndUpdate(
    { _id: req.params.reqId, firmId, status: 'pending' },
    { status: 'cancelled' },
    { new: true }
  );
  if (!request) return sendError(res, 'Payment request not found', 404);
  sendSuccess(res, request, 'Payment request cancelled');
};

/* ── Public: view + submit trust payment ───────────────────────── */
exports.getPublicPaymentRequest = async (req, res) => {
  const request = await TrustPaymentRequest.findOne({ token: req.params.token, status: 'pending' })
    .populate('firmId', 'name')
    .lean();
  if (!request) return sendError(res, 'Payment link is invalid or has expired', 404);
  if (request.expiresAt < new Date()) {
    await TrustPaymentRequest.findByIdAndUpdate(request._id, { status: 'expired' });
    return sendError(res, 'Payment link has expired', 410);
  }
  sendSuccess(res, {
    amount:      request.amount,
    description: request.description,
    message:     request.message,
    clientName:  request.clientName,
    firmName:    request.firmId?.name || 'Law Firm',
    expiresAt:   request.expiresAt,
  }, 'Payment request loaded');
};

exports.submitPublicPayment = async (req, res) => {
  const request = await TrustPaymentRequest.findOne({ token: req.params.token, status: 'pending' });
  if (!request || request.expiresAt < new Date()) {
    return sendError(res, 'Payment link is invalid or has expired', 410);
  }
  const { paymentMethod = 'other', transactionId, notes } = req.body;

  // Record as trust deposit
  const account = await TrustAccount.findById(request.trustAccountId);
  if (account) {
    const TrustTransaction = require('../models/TrustTransaction.model');
    await TrustTransaction.create({
      firmId: request.firmId, trustAccountId: account._id,
      matterId: request.matterId, type: 'deposit',
      amount: request.amount, description: request.description || 'Client trust payment',
      paymentMethod, transactionId, notes,
      date: new Date(), balanceAfter: account.balance + request.amount,
    });
    account.balance += request.amount;
    await account.save();
  }

  await TrustPaymentRequest.findByIdAndUpdate(request._id, {
    status: 'paid', paidAt: new Date(), paidVia: paymentMethod,
  });

  sendSuccess(res, { message: 'Payment recorded. Thank you.' }, 'Payment submitted');
};
