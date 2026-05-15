const router = require('express').Router();
const ctrl   = require('../controllers/leads.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

router.get('/stages',  ctrl.getStages);
router.get('/sources', ctrl.getSources);

router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id', ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);
router.patch('/:id/stage',   ...auth, ctrl.updateStage);
router.post('/:id/convert',  ...auth, ctrl.convertToMatter);

module.exports = router;
