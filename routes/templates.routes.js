const router = require('express').Router();
const ctrl   = require('../controllers/templates.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

router.get('/categories', ctrl.getCategories);

router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id', ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);
router.post('/:id/generate', ...auth, ctrl.generate);

module.exports = router;
