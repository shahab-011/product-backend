const router = require('express').Router();
const multer = require('multer');
const ctrl   = require('../controllers/contacts.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth   = [protect, authorize('lawyer','admin','owner','attorney','paralegal','staff')];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/* ── Special routes before /:id ─── */
router.get('/conflict-check',  ...auth, ctrl.conflictCheck);
router.get('/duplicates',      ...auth, ctrl.listDuplicates);
router.get('/export',          ...auth, ctrl.exportToCSV);
router.post('/import',         ...auth, upload.single('file'), ctrl.importFromCSV);

/* ── CRUD ─── */
router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id',    ...auth, ctrl.update);
router.patch('/:id',  ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);

/* ── Sub-resources ─── */
router.post('/:id/merge',     ...auth, ctrl.mergeContacts);
router.get('/:id/timeline',   ...auth, ctrl.getTimeline);
router.get('/:id/financials', ...auth, ctrl.getFinancials);

module.exports = router;
