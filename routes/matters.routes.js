const router = require('express').Router();
const ctrl   = require('../controllers/matters.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer','admin','owner','attorney','paralegal','staff')];

/* ── Static / lookup ─── */
router.get('/practice-areas', ctrl.getPracticeAreas);
router.get('/matter-stages',  ctrl.getMatterStages);
router.get('/task-templates', ctrl.getTaskTemplates);

/* ── Custom fields (firm-wide) ─── */
router.get('/custom-fields',              ...auth, ctrl.listCustomFields);
router.post('/custom-fields',             ...auth, ctrl.createCustomField);
router.patch('/custom-fields/:fieldId',   ...auth, ctrl.updateCustomField);
router.delete('/custom-fields/:fieldId',  ...auth, ctrl.deleteCustomField);

/* ── Matter CRUD ─── */
router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id',    ...auth, ctrl.update);
router.patch('/:id',  ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);

/* ── Stage actions ─── */
router.post('/:id/close',   ...auth, ctrl.closeMatter);
router.post('/:id/archive', ...auth, ctrl.archiveMatter);
router.post('/:id/reopen',  ...auth, ctrl.reopenMatter);

/* ── Notes ─── */
router.get('/:id/notes',                    ...auth, ctrl.getNotes);
router.post('/:id/notes',                   ...auth, ctrl.addNote);
router.patch('/:id/notes/:noteId',          ...auth, ctrl.updateNote);
router.post('/:id/notes/:noteId/pin',       ...auth, ctrl.togglePinNote);
router.delete('/:id/notes/:noteId',         ...auth, ctrl.deleteNote);

/* ── Contact linking ─── */
router.post('/:id/contacts/link',           ...auth, ctrl.linkContact);
router.delete('/:id/contacts/:contactId',   ...auth, ctrl.unlinkContact);

/* ── Template ─── */
router.post('/:id/apply-template', ...auth, ctrl.applyTemplate);

module.exports = router;
