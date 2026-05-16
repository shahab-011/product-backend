const router = require('express').Router();
const ctrl   = require('../controllers/workflows.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

router.get('/',              ...auth, ctrl.list);
router.post('/',             ...auth, ctrl.create);
router.put('/:id',           ...auth, ctrl.update);
router.patch('/:id/toggle',  ...auth, ctrl.toggle);

module.exports = router;
