const router  = require('express').Router();
const ctrl    = require('../controllers/matters.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

router.get('/practice-areas',  ctrl.getPracticeAreas);
router.get('/matter-stages',   ctrl.getMatterStages);
router.get('/task-templates',  ctrl.getTaskTemplates);

router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id', ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);

router.get('/:id/notes',          ...auth, ctrl.getNotes);
router.post('/:id/notes',         ...auth, ctrl.addNote);
router.delete('/:id/notes/:noteId', ...auth, ctrl.deleteNote);
router.post('/:id/apply-template', ...auth, ctrl.applyTemplate);

module.exports = router;
