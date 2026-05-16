const router = require('express').Router();
const ctrl   = require('../controllers/leads.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Specific paths BEFORE /:id
router.get('/stages',              ctrl.getStages);
router.get('/sources',             ctrl.getSources);
router.get('/analytics/pipeline',  ...auth, ctrl.getPipelineAnalytics);
router.get('/analytics/sources',   ...auth, ctrl.getSourceAnalytics);

router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id', ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);
router.patch('/:id/stage',            ...auth, ctrl.updateStage);
router.post('/:id/convert',           ...auth, ctrl.convertToMatter);
router.post('/:id/book-consultation', ...auth, ctrl.bookConsultation);

module.exports = router;
