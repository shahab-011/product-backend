const Account        = require('../models/Account.model');
const JournalEntry   = require('../models/JournalEntry.model');
const BankConnection = require('../models/BankConnection.model');
const BankTransaction= require('../models/BankTransaction.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

/* ── Default Chart of Accounts ──────────────────────────────────────── */
const DEFAULT_ACCOUNTS = [
  // Assets
  { code:'1000', name:'Cash',                   type:'asset',   subType:'Current Asset',    isBank:true  },
  { code:'1100', name:'Accounts Receivable',     type:'asset',   subType:'Current Asset'                 },
  { code:'1200', name:'Trust Account',           type:'asset',   subType:'Current Asset',    isBank:true  },
  { code:'1300', name:'Prepaid Expenses',        type:'asset',   subType:'Current Asset'                 },
  { code:'1500', name:'Equipment',               type:'asset',   subType:'Fixed Asset'                   },
  // Liabilities
  { code:'2000', name:'Accounts Payable',        type:'liability',subType:'Current Liability'             },
  { code:'2100', name:'Client Trust Liability',  type:'liability',subType:'Current Liability'             },
  { code:'2200', name:'Payroll Payable',         type:'liability',subType:'Current Liability'             },
  { code:'2900', name:'Long-term Debt',          type:'liability',subType:'Long-term Liability'           },
  // Equity
  { code:'3000', name:"Owner's Equity",          type:'equity',  subType:'Equity'                        },
  { code:'3100', name:'Retained Earnings',       type:'equity',  subType:'Equity'                        },
  // Revenue
  { code:'4000', name:'Legal Fees Revenue',      type:'revenue', subType:'Operating Revenue'             },
  { code:'4100', name:'Consultation Revenue',    type:'revenue', subType:'Operating Revenue'             },
  { code:'4200', name:'Court Filing Fees Recovered',type:'revenue',subType:'Other Revenue'               },
  { code:'4900', name:'Other Revenue',           type:'revenue', subType:'Other Revenue'                 },
  // Expenses
  { code:'5000', name:'Office Expenses',         type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Office & General' },
  { code:'5100', name:'Payroll Expense',         type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Payroll'           },
  { code:'5200', name:'Professional Fees',       type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Professional'      },
  { code:'5300', name:'Software & Technology',   type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Technology'        },
  { code:'5400', name:'Marketing & Advertising', type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Marketing'         },
  { code:'5500', name:'Rent & Occupancy',        type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Rent'              },
  { code:'5600', name:'Insurance',               type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Insurance'         },
  { code:'5700', name:'Court Filing Fees',       type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Court Fees'        },
  { code:'5900', name:'Miscellaneous Expense',   type:'expense', subType:'Operating Expense', isTaxCategory:true, taxCategoryLabel:'Miscellaneous'     },
];

/* ── Account balance update rule (double-entry normal balances) ──────── */
// Assets and Expenses → normal debit balance → DR increases, CR decreases
// Liabilities, Equity, Revenue → normal credit balance → CR increases, DR decreases
function balanceDelta(accountType, debit, credit) {
  if (accountType === 'asset' || accountType === 'expense') {
    return debit - credit;
  }
  return credit - debit;
}

/* ── 1. Seed default accounts ───────────────────────────────────────── */
exports.seedAccounts = async (req, res) => {
  const firmId = getFirmId(req);
  const existing = await Account.countDocuments({ firmId });
  if (existing > 0) return sendError(res, 'Chart of accounts already initialized', 400);

  const accounts = await Account.insertMany(
    DEFAULT_ACCOUNTS.map(a => ({ ...a, firmId, isDefault: true }))
  );
  sendSuccess(res, accounts, 'Default chart of accounts created');
};

/* ── 2. List accounts ───────────────────────────────────────────────── */
exports.listAccounts = async (req, res) => {
  const { type, isActive } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId };
  if (type)     filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const accounts = await Account.find(filter).sort({ code: 1 }).lean();
  sendSuccess(res, accounts, 'Accounts fetched');
};

/* ── 3. Create account ──────────────────────────────────────────────── */
exports.createAccount = async (req, res) => {
  const firmId = getFirmId(req);
  const { code, name, type, subType, description, isBank, isTaxCategory, taxCategoryLabel } = req.body;
  if (!code || !name || !type) return sendError(res, 'code, name, and type are required', 400);

  const existing = await Account.findOne({ firmId, code });
  if (existing) return sendError(res, `Account code ${code} already exists`, 409);

  const account = await Account.create({ firmId, code, name, type, subType, description, isBank, isTaxCategory, taxCategoryLabel });
  sendSuccess(res, account, 'Account created', 201);
};

/* ── 4. Update account ──────────────────────────────────────────────── */
exports.updateAccount = async (req, res) => {
  const { name, subType, description, isActive, isBank, isTaxCategory, taxCategoryLabel } = req.body;
  const account = await Account.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { name, subType, description, isActive, isBank, isTaxCategory, taxCategoryLabel },
    { new: true, runValidators: true }
  );
  if (!account) return sendError(res, 'Account not found', 404);
  sendSuccess(res, account, 'Account updated');
};

/* ── 5. Delete account ──────────────────────────────────────────────── */
exports.deleteAccount = async (req, res) => {
  const firmId = getFirmId(req);
  const account = await Account.findOne({ _id: req.params.id, firmId });
  if (!account) return sendError(res, 'Account not found', 404);
  if (account.isDefault) return sendError(res, 'Cannot delete a default account', 400);
  if (account.balance !== 0) return sendError(res, 'Cannot delete account with non-zero balance', 400);

  await Account.deleteOne({ _id: account._id });
  sendSuccess(res, { deleted: true }, 'Account deleted');
};

/* ── 6. List journal entries ────────────────────────────────────────── */
exports.listEntries = async (req, res) => {
  const { from, to, source, isPosted, page = 1, limit = 30 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isVoided: false };
  if (source)   filter.source   = source;
  if (isPosted !== undefined) filter.isPosted = isPosted === 'true';
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [entries, total] = await Promise.all([
    JournalEntry.find(filter)
      .populate('lines.accountId', 'code name type')
      .populate('createdBy', 'name')
      .sort({ date: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    JournalEntry.countDocuments(filter),
  ]);

  sendSuccess(res, { entries, total, page: Number(page) }, 'Journal entries fetched');
};

/* ── 7. Get single entry ────────────────────────────────────────────── */
exports.getEntry = async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, firmId: getFirmId(req) })
    .populate('lines.accountId', 'code name type')
    .populate('createdBy', 'name').lean();
  if (!entry) return sendError(res, 'Journal entry not found', 404);
  sendSuccess(res, entry, 'Entry fetched');
};

/* ── 8. Create journal entry ────────────────────────────────────────── */
exports.createEntry = async (req, res) => {
  const firmId = getFirmId(req);
  const { date, description, reference, lines, notes } = req.body;
  if (!description || !lines?.length) return sendError(res, 'description and lines[] required', 400);

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return sendError(res, `Journal entry is unbalanced: debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}`, 400);
  }

  const entry = await JournalEntry.create({
    firmId, date: date || new Date(), description, reference, lines, notes,
    createdBy: req.user._id,
  });

  sendSuccess(res, entry, 'Journal entry created', 201);
};

/* ── 9. Post journal entry ──────────────────────────────────────────── */
exports.postEntry = async (req, res) => {
  const firmId = getFirmId(req);
  const entry  = await JournalEntry.findOne({ _id: req.params.id, firmId }).populate('lines.accountId');
  if (!entry)        return sendError(res, 'Journal entry not found', 404);
  if (entry.isPosted) return sendError(res, 'Entry already posted', 400);
  if (entry.isVoided) return sendError(res, 'Cannot post a voided entry', 400);

  // Update account balances
  await Promise.all(entry.lines.map(async line => {
    const acct = await Account.findById(line.accountId);
    if (!acct) return;
    const delta = balanceDelta(acct.type, Number(line.debit) || 0, Number(line.credit) || 0);
    await Account.findByIdAndUpdate(acct._id, { $inc: { balance: delta } });
  }));

  entry.isPosted = true;
  entry.postedAt = new Date();
  await entry.save();

  sendSuccess(res, entry, 'Entry posted and account balances updated');
};

/* ── 10. Void journal entry ─────────────────────────────────────────── */
exports.voidEntry = async (req, res) => {
  const firmId = getFirmId(req);
  const entry  = await JournalEntry.findOne({ _id: req.params.id, firmId }).populate('lines.accountId');
  if (!entry)        return sendError(res, 'Journal entry not found', 404);
  if (entry.isVoided) return sendError(res, 'Entry already voided', 400);

  if (entry.isPosted) {
    // Reverse account balance changes
    await Promise.all(entry.lines.map(async line => {
      const acct = await Account.findById(line.accountId);
      if (!acct) return;
      const delta = balanceDelta(acct.type, Number(line.debit) || 0, Number(line.credit) || 0);
      await Account.findByIdAndUpdate(acct._id, { $inc: { balance: -delta } });
    }));
  }

  entry.isVoided  = true;
  entry.voidedAt  = new Date();
  entry.voidReason= req.body.reason || 'Voided by user';
  entry.isPosted  = false;
  await entry.save();

  sendSuccess(res, entry, 'Entry voided');
};

/* ── 11. Auto-post from invoice paid ────────────────────────────────── */
exports.postFromInvoice = async (firmId, invoiceId, amount) => {
  try {
    const [cashAcct, arAcct] = await Promise.all([
      Account.findOne({ firmId, code: '1000' }),
      Account.findOne({ firmId, code: '1100' }),
    ]);
    if (!cashAcct || !arAcct) return;

    // Check if already posted for this invoice
    const existing = await JournalEntry.findOne({ firmId, source: 'invoice', sourceId: invoiceId });
    if (existing) return;

    const system = await require('../models/User.model').findOne({ _id: firmId });
    const entry = await JournalEntry.create({
      firmId,
      date:        new Date(),
      description: `Invoice payment received`,
      source:      'invoice',
      sourceId:    invoiceId,
      lines: [
        { accountId: cashAcct._id, debit: amount, credit: 0, description: 'Payment received' },
        { accountId: arAcct._id,   debit: 0, credit: amount, description: 'AR cleared'       },
      ],
      createdBy: firmId,
      isPosted:  true,
      postedAt:  new Date(),
    });

    await Account.findByIdAndUpdate(cashAcct._id, { $inc: { balance: amount } });
    await Account.findByIdAndUpdate(arAcct._id,   { $inc: { balance: -amount } });
    return entry;
  } catch (e) {
    console.error('[accounting] postFromInvoice failed:', e.message);
  }
};

/* ── 12. Auto-post from trust transaction ───────────────────────────── */
exports.postFromTrust = async (firmId, trustTxId, amount, type, createdBy) => {
  try {
    const trustAcct = await Account.findOne({ firmId, code: '1200' });
    const trustLiab = await Account.findOne({ firmId, code: '2100' });
    if (!trustAcct || !trustLiab) return;

    const existing = await JournalEntry.findOne({ firmId, source: 'trust', sourceId: trustTxId });
    if (existing) return;

    const isDeposit = ['deposit', 'retainer'].includes(type);
    const lines = isDeposit
      ? [
          { accountId: trustAcct._id, debit: amount, credit: 0, description: 'Trust deposit received' },
          { accountId: trustLiab._id, debit: 0, credit: amount, description: 'Client trust liability' },
        ]
      : [
          { accountId: trustLiab._id, debit: amount, credit: 0, description: 'Trust disbursement' },
          { accountId: trustAcct._id, debit: 0, credit: amount, description: 'Trust account reduction' },
        ];

    const entry = await JournalEntry.create({
      firmId, date: new Date(),
      description: `Trust ${type}: $${amount.toFixed(2)}`,
      source: 'trust', sourceId: trustTxId,
      lines, createdBy: createdBy || firmId,
      isPosted: true, postedAt: new Date(),
    });

    const trustDelta = isDeposit ? amount : -amount;
    const liabDelta  = isDeposit ? -amount : amount;
    await Account.findByIdAndUpdate(trustAcct._id, { $inc: { balance: trustDelta } });
    await Account.findByIdAndUpdate(trustLiab._id, { $inc: { balance: liabDelta  } });
    return entry;
  } catch (e) {
    console.error('[accounting] postFromTrust failed:', e.message);
  }
};

/* ── 13. Bank connections ───────────────────────────────────────────── */
exports.listConnections = async (req, res) => {
  const conns = await BankConnection.find({ firmId: getFirmId(req), isActive: true })
    .populate('accountId', 'code name balance').lean();
  sendSuccess(res, conns, 'Bank connections fetched');
};

exports.createConnection = async (req, res) => {
  const firmId = getFirmId(req);
  const { institutionName, accountName, accountType, accountMask, isManual } = req.body;
  if (!institutionName || !accountName) return sendError(res, 'institutionName and accountName required', 400);

  // Create a linked Account in chart of accounts
  const code = `1${Math.floor(Math.random() * 400 + 50)}`;
  const acct  = await Account.create({
    firmId, code, name: `${institutionName} - ${accountName}`,
    type: 'asset', subType: 'Current Asset', isBank: true,
  }).catch(() => null);

  const conn = await BankConnection.create({
    firmId,
    accountId: acct?._id,
    institutionName, accountName,
    accountType: accountType || 'checking',
    accountMask: accountMask || '',
    isManual: isManual !== false,
  });

  if (acct) {
    await Account.findByIdAndUpdate(acct._id, { bankConnectionId: conn._id });
  }

  sendSuccess(res, conn, 'Bank account connected', 201);
};

exports.disconnectBank = async (req, res) => {
  const conn = await BankConnection.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { isActive: false },
    { new: true }
  );
  if (!conn) return sendError(res, 'Connection not found', 404);
  sendSuccess(res, conn, 'Bank account disconnected');
};

/* ── 14. Bank transactions ──────────────────────────────────────────── */
exports.listTransactions = async (req, res) => {
  const { connectionId, status, from, to, page = 1, limit = 50 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId };
  if (connectionId) filter.bankConnectionId = connectionId;
  if (status)       filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [txns, total] = await Promise.all([
    BankTransaction.find(filter)
      .populate('bankConnectionId', 'institutionName accountName')
      .populate('matchedJournalEntryId', 'description reference')
      .sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    BankTransaction.countDocuments(filter),
  ]);

  sendSuccess(res, { transactions: txns, total, page: Number(page) }, 'Transactions fetched');
};

exports.importTransactions = async (req, res) => {
  const firmId = getFirmId(req);
  const { connectionId, transactions } = req.body;
  if (!connectionId || !transactions?.length) return sendError(res, 'connectionId and transactions[] required', 400);

  const conn = await BankConnection.findOne({ _id: connectionId, firmId });
  if (!conn) return sendError(res, 'Bank connection not found', 404);

  let imported = 0;
  for (const t of transactions) {
    try {
      await BankTransaction.create({
        firmId, bankConnectionId: connectionId,
        date:        new Date(t.date),
        amount:      Number(t.amount),
        description: t.description || '',
        merchant:    t.merchant || '',
        category:    t.category || [],
        status:      'unmatched',
      });
      imported++;
    } catch (e) {
      if (e.code !== 11000) console.error('[import] tx error:', e.message);
    }
  }

  await BankConnection.findByIdAndUpdate(connectionId, { lastSyncAt: new Date(), syncStatus: 'idle' });
  sendSuccess(res, { imported }, `${imported} transaction(s) imported`);
};

exports.matchTransaction = async (req, res) => {
  const { journalEntryId } = req.body;
  const firmId = getFirmId(req);

  const [txn, entry] = await Promise.all([
    BankTransaction.findOne({ _id: req.params.id, firmId }),
    journalEntryId ? JournalEntry.findOne({ _id: journalEntryId, firmId }) : Promise.resolve(null),
  ]);
  if (!txn) return sendError(res, 'Transaction not found', 404);

  txn.status               = journalEntryId ? 'matched' : 'unmatched';
  txn.matchedJournalEntryId = journalEntryId || null;
  await txn.save();

  sendSuccess(res, txn, journalEntryId ? 'Transaction matched' : 'Match cleared');
};

exports.excludeTransaction = async (req, res) => {
  const txn = await BankTransaction.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { status: 'excluded' },
    { new: true }
  );
  if (!txn) return sendError(res, 'Transaction not found', 404);
  sendSuccess(res, txn, 'Transaction excluded');
};

exports.updateTransactionMeta = async (req, res) => {
  const { taxCategory, notes } = req.body;
  const txn = await BankTransaction.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { taxCategory, notes },
    { new: true }
  );
  if (!txn) return sendError(res, 'Transaction not found', 404);
  sendSuccess(res, txn, 'Transaction updated');
};

/* ── 15. Reports ────────────────────────────────────────────────────── */
exports.getPL = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const toDate   = to   ? new Date(to)   : new Date();

  // Aggregate posted journal entry lines within date range
  const lines = await JournalEntry.aggregate([
    { $match: { firmId, isPosted: true, isVoided: false, date: { $gte: fromDate, $lte: toDate } } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.accountId', totalDebit: { $sum: '$lines.debit' }, totalCredit: { $sum: '$lines.credit' } } },
    { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['revenue', 'expense'] } } },
    { $project: {
        accountId: '$_id', code: '$account.code', name: '$account.name',
        type: '$account.type', subType: '$account.subType',
        balance: {
          $cond: [
            { $eq: ['$account.type', 'revenue'] },
            { $subtract: ['$totalCredit', '$totalDebit'] },
            { $subtract: ['$totalDebit', '$totalCredit'] },
          ]
        }
    }},
    { $sort: { code: 1 } },
  ]);

  const revenue  = lines.filter(l => l.type === 'revenue');
  const expenses = lines.filter(l => l.type === 'expense');
  const totalRevenue  = revenue.reduce((s, l) => s + l.balance, 0);
  const totalExpenses = expenses.reduce((s, l) => s + l.balance, 0);

  sendSuccess(res, {
    period: { from: fromDate, to: toDate },
    revenue, expenses,
    totalRevenue, totalExpenses,
    netIncome: totalRevenue - totalExpenses,
  }, 'P&L report generated');
};

exports.getBalanceSheet = async (req, res) => {
  const firmId = getFirmId(req);
  const asOf   = req.query.asOf ? new Date(req.query.asOf) : new Date();

  const accounts = await Account.find({ firmId, isActive: true, type: { $in: ['asset','liability','equity'] } })
    .sort({ code: 1 }).lean();

  const assets      = accounts.filter(a => a.type === 'asset');
  const liabilities = accounts.filter(a => a.type === 'liability');
  const equity      = accounts.filter(a => a.type === 'equity');

  const totalAssets      = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.balance, 0);

  sendSuccess(res, {
    asOf,
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity,
    liabilitiesAndEquity: totalLiabilities + totalEquity,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  }, 'Balance sheet generated');
};

exports.getTrialBalance = async (req, res) => {
  const firmId = getFirmId(req);
  const accounts = await Account.find({ firmId, isActive: true }).sort({ code: 1 }).lean();

  const rows = accounts.map(a => {
    const isDebitNormal = a.type === 'asset' || a.type === 'expense';
    return {
      code: a.code, name: a.name, type: a.type,
      debit:  isDebitNormal && a.balance > 0 ? a.balance : (isDebitNormal ? 0 : 0),
      credit: !isDebitNormal && a.balance > 0 ? a.balance : 0,
      balance: a.balance,
    };
  });

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  sendSuccess(res, { rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 }, 'Trial balance generated');
};

exports.getGeneralLedger = async (req, res) => {
  const { accountId, from, to } = req.query;
  const firmId  = getFirmId(req);
  const filter  = { firmId, isPosted: true, isVoided: false };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const entries = await JournalEntry.find(filter)
    .populate({ path: 'lines.accountId', select: 'code name type' })
    .sort({ date: 1 }).lean();

  // Filter to specific account if requested
  const ledger = entries.flatMap(e => {
    const relevantLines = accountId
      ? e.lines.filter(l => String(l.accountId?._id) === accountId)
      : e.lines;
    return relevantLines.map(l => ({
      date: e.date, description: e.description, reference: e.reference,
      account: l.accountId, debit: l.debit, credit: l.credit,
      entryId: e._id,
    }));
  });

  sendSuccess(res, { entries: ledger }, 'General ledger fetched');
};

/* ── 16. Reconciliation ─────────────────────────────────────────────── */
exports.reconcile = async (req, res) => {
  const { connectionId, statementBalance, statementDate } = req.body;
  const firmId = getFirmId(req);

  const conn = await BankConnection.findOne({ _id: connectionId, firmId }).populate('accountId');
  if (!conn) return sendError(res, 'Bank connection not found', 404);

  const bookBalance = conn.accountId?.balance || 0;
  const unmatched   = await BankTransaction.countDocuments({ firmId, bankConnectionId: connectionId, status: 'unmatched' });

  sendSuccess(res, {
    statementBalance: Number(statementBalance),
    bookBalance,
    difference:       Math.abs(bookBalance - Number(statementBalance)),
    isReconciled:     Math.abs(bookBalance - Number(statementBalance)) < 0.01,
    unmatchedCount:   unmatched,
    statementDate,
  }, 'Reconciliation summary');
};

/* ── 17. Dashboard overview ─────────────────────────────────────────── */
exports.getDashboard = async (req, res) => {
  const firmId = getFirmId(req);
  const now    = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [accounts, unmatchedCount] = await Promise.all([
    Account.find({ firmId, isActive: true }).lean(),
    BankTransaction.countDocuments({ firmId, status: 'unmatched' }),
  ]);

  const cash       = accounts.filter(a => a.isBank && a.type === 'asset').reduce((s,a) => s + a.balance, 0);
  const ar         = accounts.find(a => a.code === '1100')?.balance || 0;
  const trustLiab  = accounts.find(a => a.code === '2100')?.balance || 0;

  sendSuccess(res, {
    cashBalance: cash,
    accountsReceivable: ar,
    trustLiability: trustLiab,
    unmatchedTransactions: unmatchedCount,
    accounts,
  }, 'Accounting dashboard');
};
