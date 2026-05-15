const router = require('express').Router();
const ctrl   = require('../controllers/billing.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

// Invoices
router.get('/invoices',                    ...auth, ctrl.listInvoices);
router.post('/invoices',                   ...auth, ctrl.createInvoice);
router.post('/invoices/generate',          ...auth, ctrl.generateFromMatter);
router.get('/invoices/:id',                ...auth, ctrl.getInvoice);
router.put('/invoices/:id',                ...auth, ctrl.updateInvoice);
router.delete('/invoices/:id',             ...auth, ctrl.deleteInvoice);
router.post('/invoices/:id/send',          ...auth, ctrl.sendInvoice);
router.post('/invoices/:id/mark-paid',     ...auth, ctrl.markPaid);
router.post('/invoices/:id/payment-link',  ...auth, ctrl.createPaymentLink);

// Trust accounting
router.get('/trust-accounts',                              ...auth, ctrl.listTrustAccounts);
router.post('/trust-accounts/:accountId/deposit',          ...auth, ctrl.trustDeposit);
router.post('/trust-accounts/:accountId/transfer',         ...auth, ctrl.trustTransfer);
router.get('/trust-accounts/:accountId/reconciliation',    ...auth, ctrl.reconciliation);

module.exports = router;
