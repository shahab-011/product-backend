const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const {
  getDashboard,
  sendLinkRequest, getLinkedClients, getClientDocuments, unlinkClient,
  getLinkRequests, getMyLinks, acceptLinkRequest, rejectLinkRequest, clientUnlink,
  shareDocument, unshareDocument,
  getCases, getCase, createCase, updateCase, deleteCase,
  getClients,
} = require('../controllers/lawyer.controller');

/* ── Lawyer-only routes ──────────────────────────────────────────────── */
router.get('/dashboard',                     protect, authorize('lawyer', 'admin'), getDashboard);
router.post('/link-request',                 protect, authorize('lawyer', 'admin'), sendLinkRequest);
router.get('/linked-clients',                protect, authorize('lawyer', 'admin'), getLinkedClients);
router.get('/clients',                       protect, authorize('lawyer', 'admin'), getClients);
router.get('/clients/:clientId/documents',   protect, authorize('lawyer', 'admin'), getClientDocuments);
router.patch('/links/:linkId/unlink',        protect, authorize('lawyer', 'admin'), unlinkClient);

router.route('/cases')
  .get(protect, authorize('lawyer', 'admin'), getCases)
  .post(protect, authorize('lawyer', 'admin'), createCase);

router.route('/cases/:id')
  .get(protect, authorize('lawyer', 'admin'), getCase)
  .put(protect, authorize('lawyer', 'admin'), updateCase)
  .delete(protect, authorize('lawyer', 'admin'), deleteCase);

/* ── Client (user) routes — any authenticated user ───────────────────── */
router.get('/link-requests',                         protect, getLinkRequests);
router.get('/my-links',                              protect, getMyLinks);
router.patch('/link-requests/:linkId/accept',        protect, acceptLinkRequest);
router.patch('/link-requests/:linkId/reject',        protect, rejectLinkRequest);
router.patch('/my-links/:linkId/unlink',             protect, clientUnlink);
router.post('/share-document',                       protect, shareDocument);
router.post('/unshare-document',                     protect, unshareDocument);

module.exports = router;
