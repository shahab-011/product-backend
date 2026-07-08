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
  getClientLink, getLinkDocuments, getClientDocAnalysis,
} = require('../controllers/lawyer.controller');

/* ── Lawyer-only routes ──────────────────────────────────────────────── */
router.get('/dashboard',                     protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getDashboard);
router.post('/link-request',                 protect, authorize('lawyer', 'admin', 'owner', 'attorney'), sendLinkRequest);
router.get('/linked-clients',                protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getLinkedClients);
router.get('/clients',                       protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getClients);
router.get('/clients/:clientId/documents',   protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getClientDocuments);
router.patch('/links/:linkId/unlink',        protect, authorize('lawyer', 'admin', 'owner', 'attorney'), unlinkClient);

/* ── Single link + shared document analysis (client view page) ───────── */
router.get('/links/:linkId',                                   protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getClientLink);
router.get('/links/:linkId/documents',                         protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getLinkDocuments);
router.get('/links/:linkId/documents/:docId/analysis',         protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getClientDocAnalysis);

router.route('/cases')
  .get(protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getCases)
  .post(protect, authorize('lawyer', 'admin', 'owner', 'attorney'), createCase);

router.route('/cases/:id')
  .get(protect, authorize('lawyer', 'admin', 'owner', 'attorney'), getCase)
  .put(protect, authorize('lawyer', 'admin', 'owner', 'attorney'), updateCase)
  .delete(protect, authorize('lawyer', 'admin', 'owner', 'attorney'), deleteCase);

/* ── Client (user) routes — any authenticated user ───────────────────── */
router.get('/link-requests',                         protect, getLinkRequests);
router.get('/my-links',                              protect, getMyLinks);
router.patch('/link-requests/:linkId/accept',        protect, acceptLinkRequest);
router.patch('/link-requests/:linkId/reject',        protect, rejectLinkRequest);
router.patch('/my-links/:linkId/unlink',             protect, clientUnlink);
router.post('/share-document',                       protect, shareDocument);
router.post('/unshare-document',                     protect, unshareDocument);

module.exports = router;
