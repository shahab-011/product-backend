const router = require('express').Router();
const ctrl   = require('../controllers/esign.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// ── Public (no auth — token-based) ──────────────────────────────
router.get('/esign/sign/:token',          ctrl.getDocumentToSign);
router.post('/esign/sign/:token',         ctrl.submitSignature);
router.post('/esign/sign/:token/decline', ctrl.declineSignature);

// ── Specific routes BEFORE /:id ─────────────────────────────────
// (none needed here — all specific paths include an action segment)

// ── E-sign request CRUD ─────────────────────────────────────────
router.get('/esign-requests',          ...auth, ctrl.list);
router.post('/esign-requests',         ...auth, ctrl.create);
router.get('/esign-requests/:id',      ...auth, ctrl.get);
router.put('/esign-requests/:id',      ...auth, ctrl.update);
router.delete('/esign-requests/:id',   ...auth, ctrl.remove);

// ── Actions ─────────────────────────────────────────────────────
router.post('/esign-requests/:id/send',        ...auth, ctrl.send);
router.post('/esign-requests/:id/void',        ...auth, ctrl.void);
router.post('/esign-requests/:id/resend',      ...auth, ctrl.resend);
router.get('/esign-requests/:id/audit-trail',  ...auth, ctrl.getAuditTrail);
router.get('/esign-requests/:id/download',     ...auth, ctrl.downloadSignedDoc);

module.exports = router;
