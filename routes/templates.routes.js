const router = require('express').Router();
const ctrl   = require('../controllers/templates.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Specific routes BEFORE /:id
router.get('/doc-templates/categories',  ctrl.getCategories);
router.post('/doc-templates/ai-convert', ...auth, ctrl.aiConvert);
router.get('/doc-templates/generated',   ...auth, ctrl.listGeneratedDocs);

// Main CRUD
router.get('/doc-templates',         ...auth, ctrl.list);
router.post('/doc-templates',        ...auth, ctrl.create);
router.get('/doc-templates/:id',     ...auth, ctrl.get);
router.put('/doc-templates/:id',     ...auth, ctrl.update);
router.delete('/doc-templates/:id',  ...auth, ctrl.remove);

// Document actions
router.patch('/doc-templates/:id/favorite',            ...auth, ctrl.toggleFavorite);
router.post('/doc-templates/:id/generate',             ...auth, ctrl.generate);
router.get('/doc-templates/:id/versions',              ...auth, ctrl.listVersions);
router.post('/doc-templates/:id/restore/:versionId',   ...auth, ctrl.restoreVersion);

// Court Forms
router.get('/court-forms',           ...auth, ctrl.listCourtForms);
router.get('/court-forms/:id/fill',  ...auth, ctrl.fillCourtForm);

module.exports = router;
