const router = require('express').Router();
const ctrl   = require('../controllers/billing.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Public routes (no auth — client payment portal)
router.get('/payments/public/:token',      ctrl.getPublicInvoice);
router.post('/payments/public/:token/pay', ctrl.submitPayment);
router.post('/payments/stripe-webhook',    ctrl.stripeWebhook);

// Invoices
router.get('/invoices',                          ...auth, ctrl.listInvoices);
router.post('/invoices',                         ...auth, ctrl.createInvoice);
router.post('/invoices/generate',                ...auth, ctrl.generateFromMatter);
router.post('/invoices/batch-generate',          ...auth, ctrl.batchGenerate);
router.get('/invoices/:id',                      ...auth, ctrl.getInvoice);
router.put('/invoices/:id',                      ...auth, ctrl.updateInvoice);
router.patch('/invoices/:id',                    ...auth, ctrl.updateInvoice);
router.delete('/invoices/:id',                   ...auth, ctrl.deleteInvoice);
router.post('/invoices/:id/send',                ...auth, ctrl.sendInvoice);
router.post('/invoices/:id/mark-paid',           ...auth, ctrl.markPaid);
router.post('/invoices/:id/void',                ...auth, ctrl.voidInvoice);
router.post('/invoices/:id/write-off',           ...auth, ctrl.writeOff);
router.post('/invoices/:id/payment-link',        ...auth, ctrl.generatePaymentLink);
router.post('/invoices/:id/payment-plan',        ...auth, ctrl.createPaymentPlan);
router.post('/invoices/:id/reminder',            ...auth, ctrl.sendReminder);
router.post('/invoices/:id/credit-note',         ...auth, ctrl.issueCreditNote);

// Credit notes
router.get('/credit-notes', ...auth, ctrl.listCreditNotes);

// Trust accounting
router.get('/trust-accounts',                           ...auth, ctrl.listTrustAccounts);
router.post('/trust-accounts/:accountId/deposit',       ...auth, ctrl.trustDeposit);
router.post('/trust-accounts/:accountId/transfer',      ...auth, ctrl.trustTransfer);
router.get('/trust-accounts/:accountId/reconciliation', ...auth, ctrl.reconciliation);

module.exports = router;
