const router = require('express').Router();
const multer = require('multer');
const ctrl   = require('../controllers/practiceDocuments.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 250 * 1024 * 1024 },
});

// Public share (no auth)
router.get('/shared-doc/:token', ctrl.getSharedDocument);

// Specific doc routes BEFORE /:id
router.post('/practice-docs/bulk-move',          ...auth, ctrl.bulkMoveDocuments);
router.post('/practice-docs/upload-from-cloud',  ...auth, ctrl.importFromCloud);
router.post('/practice-docs/upload',             ...auth, upload.single('file'), ctrl.uploadDocument);

// Document CRUD
router.get('/practice-docs',     ...auth, ctrl.listDocuments);
router.get('/practice-docs/:id', ...auth, ctrl.getDocument);
router.put('/practice-docs/:id', ...auth, ctrl.updateDocument);
router.patch('/practice-docs/:id', ...auth, ctrl.updateDocument);
router.delete('/practice-docs/:id', ...auth, ctrl.softDeleteDocument);

// Document actions
router.get('/practice-docs/:id/download',           ...auth, ctrl.downloadDocument);
router.get('/practice-docs/:id/preview',             ...auth, ctrl.getPreviewUrl);
router.post('/practice-docs/:id/versions',           ...auth, upload.single('file'), ctrl.uploadNewVersion);
router.get('/practice-docs/:id/versions',            ...auth, ctrl.listVersions);
router.post('/practice-docs/:id/restore/:versionId', ...auth, ctrl.restoreVersion);
router.post('/practice-docs/:id/share',              ...auth, ctrl.createShareLink);

// Folders
router.get('/folders',     ...auth, ctrl.listFolders);
router.post('/folders',    ...auth, ctrl.createFolder);
router.put('/folders/:id', ...auth, ctrl.renameFolder);
router.delete('/folders/:id', ...auth, ctrl.deleteFolder);

// Document requests
router.get('/document-requests',             ...auth, ctrl.listRequests);
router.post('/document-requests',            ...auth, ctrl.createRequest);
router.patch('/document-requests/:id/fulfil', ...auth, ctrl.fulfilRequest);

module.exports = router;
