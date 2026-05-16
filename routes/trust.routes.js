const router = require('express').Router();
const ctrl   = require('../controllers/trust.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Accounts
router.get('/trust-accounts',         ...auth, ctrl.listTrustAccounts);
router.post('/trust-accounts',        ...auth, ctrl.createTrustAccount);
router.put('/trust-accounts/:id',     ...auth, ctrl.updateTrustAccount);
router.patch('/trust-accounts/:id',   ...auth, ctrl.updateTrustAccount);

// Ledgers
router.get('/trust-accounts/:id/ledger',                    ...auth, ctrl.getAccountLedger);
router.get('/trust-accounts/:id/matter-ledger/:matterId',   ...auth, ctrl.getMatterLedger);
router.get('/trust-accounts/:id/transactions',              ...auth, ctrl.listTransactions);
router.get('/trust-accounts/:id/reconciliation-report',     ...auth, ctrl.getReconciliationReport);

// Transactions
router.post('/trust-accounts/:id/deposit',       ...auth, ctrl.recordDeposit);
router.post('/trust-accounts/:id/disbursement',  ...auth, ctrl.recordDisbursement);
router.post('/trust-accounts/:id/transfer',      ...auth, ctrl.transferToOperating);
router.post('/trust-accounts/:id/refund',        ...auth, ctrl.recordRefund);
router.post('/trust-accounts/:id/reconcile',     ...auth, ctrl.performReconciliation);

router.patch('/trust-accounts/:id/transactions/:txId/void', ...auth, ctrl.voidTransaction);

module.exports = router;
