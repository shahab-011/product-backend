const router = require('express').Router();
const ctrl   = require('../controllers/communications.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Static / specific paths BEFORE /:id
router.get('/types',                  ctrl.getTypes);
router.post('/gmail/file',            ...auth, ctrl.fileEmailFromGmail);
router.post('/outlook/file',          ...auth, ctrl.fileEmailFromOutlook);
router.get('/timeline/:contactId',    ...auth, ctrl.getContactTimeline);
router.get('/export/:matterId',       ...auth, ctrl.exportMatterTimeline);

// Email templates (co-located — avoids a separate route file)
router.get('/email-templates',        ...auth, ctrl.listEmailTemplates);
router.post('/email-templates',       ...auth, ctrl.createEmailTemplate);
router.put('/email-templates/:id',    ...auth, ctrl.updateEmailTemplate);
router.delete('/email-templates/:id', ...auth, ctrl.deleteEmailTemplate);

// CRUD
router.get('/',    ...auth, ctrl.list);
router.post('/',   ...auth, ctrl.create);
router.get('/:id', ...auth, ctrl.get);
router.put('/:id', ...auth, ctrl.update);
router.delete('/:id', ...auth, ctrl.remove);
router.post('/:id/time-entry', ...auth, ctrl.createTimeEntryFromLog);

module.exports = router;
