const router = require('express').Router();
const ctrl   = require('../controllers/intakeForms.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Public routes BEFORE protected /:id
router.get('/public/:slug',         ctrl.getPublicForm);
router.post('/public/:slug/submit', ctrl.submitForm);

// Protected
router.get('/',              ...auth, ctrl.list);
router.post('/',             ...auth, ctrl.create);
router.get('/:id/responses', ...auth, ctrl.listResponses);
router.get('/:id',           ...auth, ctrl.get);
router.put('/:id',           ...auth, ctrl.update);
router.delete('/:id',        ...auth, ctrl.remove);

module.exports = router;
