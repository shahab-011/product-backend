const router = require('express').Router();
const ctrl   = require('../controllers/search.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth  = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];
const admin = [protect, authorize('owner', 'admin')];

router.get('/',         ...auth,  ctrl.globalSearch);
router.get('/audit',    ...admin, ctrl.getAuditLog);

module.exports = router;
