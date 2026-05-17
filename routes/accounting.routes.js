const router = require('express').Router();
const ctrl   = require('../controllers/accounting.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth  = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];
const admin = [protect, authorize('owner', 'admin')];

// ── Dashboard ────────────────────────────────────────────────────────
router.get('/dashboard', ...auth, ctrl.getDashboard);

// ── Chart of Accounts ────────────────────────────────────────────────
router.post('/accounts/seed',      ...admin, ctrl.seedAccounts);
router.get('/accounts',            ...auth,  ctrl.listAccounts);
router.post('/accounts',           ...admin, ctrl.createAccount);
router.put('/accounts/:id',        ...admin, ctrl.updateAccount);
router.delete('/accounts/:id',     ...admin, ctrl.deleteAccount);

// ── Journal Entries (static before /:id) ────────────────────────────
router.get('/entries',             ...auth,  ctrl.listEntries);
router.post('/entries',            ...auth,  ctrl.createEntry);
router.get('/entries/:id',         ...auth,  ctrl.getEntry);
router.post('/entries/:id/post',   ...admin, ctrl.postEntry);
router.post('/entries/:id/void',   ...admin, ctrl.voidEntry);

// ── Bank Connections ─────────────────────────────────────────────────
router.get('/banks',               ...auth,  ctrl.listConnections);
router.post('/banks',              ...admin, ctrl.createConnection);
router.delete('/banks/:id',        ...admin, ctrl.disconnectBank);

// ── Bank Transactions ────────────────────────────────────────────────
router.get('/transactions',                        ...auth,  ctrl.listTransactions);
router.post('/transactions/import',                ...admin, ctrl.importTransactions);
router.patch('/transactions/:id/match',            ...auth,  ctrl.matchTransaction);
router.patch('/transactions/:id/exclude',          ...auth,  ctrl.excludeTransaction);
router.patch('/transactions/:id/meta',             ...auth,  ctrl.updateTransactionMeta);

// ── Reports ──────────────────────────────────────────────────────────
router.get('/reports/pl',              ...auth, ctrl.getPL);
router.get('/reports/balance-sheet',   ...auth, ctrl.getBalanceSheet);
router.get('/reports/trial-balance',   ...auth, ctrl.getTrialBalance);
router.get('/reports/general-ledger',  ...auth, ctrl.getGeneralLedger);

// ── Reconciliation ───────────────────────────────────────────────────
router.post('/reconcile',              ...auth, ctrl.reconcile);

module.exports = router;
