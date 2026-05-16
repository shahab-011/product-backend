const router = require('express').Router();
const ctrl   = require('../controllers/reports.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Dashboard + summary
router.get('/dashboard',          ...auth, ctrl.getFirmDashboard);
router.get('/summary',            ...auth, ctrl.getFullSummary);

// Financial
router.get('/revenue',            ...auth, ctrl.getRevenueReport);
router.get('/accounts-receivable',...auth, ctrl.getARAgingReport);
router.get('/collections',        ...auth, ctrl.getCollectionsReport);
router.get('/trust',              ...auth, ctrl.getTrustReport);

// Time & productivity
router.get('/time',               ...auth, ctrl.getTimeReport);
router.get('/utilization',        ...auth, ctrl.getUtilizationReport);
router.get('/wip',                ...auth, ctrl.getWorkInProgress);

// Matters & pipeline
router.get('/matters',            ...auth, ctrl.getMatterReport);
router.get('/pipeline',           ...auth, ctrl.getPipelineReport);
router.get('/lead-sources',       ...auth, ctrl.getLeadSourceReport);

// Custom reports — static paths before /:id
router.get('/custom',             ...auth, ctrl.listCustomReports);
router.post('/custom',            ...auth, ctrl.createCustomReport);
router.get('/custom/:id',         ...auth, ctrl.runCustomReport);
router.put('/custom/:id',         ...auth, ctrl.updateCustomReport);
router.delete('/custom/:id',      ...auth, ctrl.deleteCustomReport);
router.post('/custom/:id/schedule',...auth, ctrl.scheduleReport);
router.get('/custom/:id/export',  ...auth, ctrl.exportReport);

module.exports = router;
