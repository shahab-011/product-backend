const router      = require('express').Router();
const multer      = require('multer');
const ctrl        = require('../controllers/portal.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const portalAuth  = require('../middleware/portalAuth.middleware');

const firmAuth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
});

/* ── Public: magic link & OTP auth ─────────────────────────────── */
router.get('/portal/magic/:token',        ctrl.magicLinkAuth);
router.post('/portal/auth/request-otp',   ctrl.requestOTP);
router.post('/portal/auth/verify-otp',    ctrl.verifyOTP);

/* ── Firm-side portal management (JWT auth) ─────────────────────── */
router.post('/portal/invite',             ...firmAuth, ctrl.inviteClient);
router.get('/portal/accesses',            ...firmAuth, ctrl.listAccesses);
router.patch('/portal/accesses/:id/revoke', ...firmAuth, ctrl.revokeAccess);
router.post('/portal/firm/messages',      ...firmAuth, ctrl.sendMessageFromFirm);

/* ── Client-side portal (portalAuth token) ──────────────────────── */
router.get('/portal/me',                  portalAuth, ctrl.getPortalMe);
router.get('/portal/matter',              portalAuth, ctrl.getPortalMatter);
router.get('/portal/documents',           portalAuth, ctrl.listPortalDocuments);
router.post('/portal/documents/upload',   portalAuth, upload.single('file'), ctrl.clientUploadDocument);
router.get('/portal/invoices',            portalAuth, ctrl.listPortalInvoices);
router.get('/portal/appointments',        portalAuth, ctrl.listPortalAppointments);
router.get('/portal/messages',            portalAuth, ctrl.listPortalMessages);
router.post('/portal/messages',           portalAuth, ctrl.sendMessageFromClient);
router.patch('/portal/messages/:id/read', portalAuth, ctrl.markMessageRead);
router.get('/portal/forms',               portalAuth, ctrl.listPendingForms);

module.exports = router;
