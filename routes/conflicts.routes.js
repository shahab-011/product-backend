const router = require('express').Router();
const ctrl   = require('../controllers/conflicts.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Static paths BEFORE /:id
router.get('/history',       ...auth, ctrl.listConflictChecks);
router.post('/check',        ...auth, ctrl.runConflictCheck);

// /:id routes
router.get('/:id',           ...auth, ctrl.getConflictCheckReport);
router.patch('/:id/resolve', ...auth, ctrl.resolveConflict);
router.post('/:id/waiver',   ...auth, ctrl.createWaiver);

module.exports = router;
