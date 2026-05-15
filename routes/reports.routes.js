const router = require('express').Router();
const ctrl   = require('../controllers/reports.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

router.get('/summary',     ...auth, ctrl.summary);
router.get('/revenue',     ...auth, ctrl.revenueByPeriod);
router.get('/utilization', ...auth, ctrl.utilizationReport);

module.exports = router;
