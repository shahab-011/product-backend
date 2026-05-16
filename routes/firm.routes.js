const router = require('express').Router();
const ctrl   = require('../controllers/firm.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth  = [protect, authorize('lawyer','admin','owner','attorney','paralegal','staff')];
const admin = [protect, authorize('admin','owner')];

// Settings
router.get('/',    ...auth,  ctrl.getSettings);
router.put('/',    ...admin, ctrl.updateSettings);
router.put('/billing',       ...admin, ctrl.updateBillingConfig);
router.put('/notifications', ...auth,  ctrl.updateNotifications);
router.put('/security',      ...admin, ctrl.updateSecuritySettings);
router.put('/practice-areas',...admin, ctrl.updatePracticeAreas);

// Team — static before /:memberId
router.get('/team',                           ...auth,  ctrl.listTeam);
router.post('/team/invite',                   ...admin, ctrl.inviteMember);
router.put('/team/:memberId',                 ...admin, ctrl.updateMember);
router.patch('/team/:memberId/toggle-status', ...admin, ctrl.toggleMemberStatus);
router.patch('/team/:memberId/toggle',        ...admin, ctrl.toggleMemberStatus);
router.delete('/team/:memberId',              ...admin, ctrl.removeMember);

// Roles
router.get('/roles',         ...auth,  ctrl.listRoles);
router.post('/roles',        ...admin, ctrl.createCustomRole);
router.put('/roles/:id',     ...admin, ctrl.updateCustomRole);
router.delete('/roles/:id',  ...admin, ctrl.deleteCustomRole);

// Integrations
router.delete('/integrations/:name', ...admin, ctrl.disconnectIntegration);

// Stripe
router.post('/stripe/onboard',           ...admin, ctrl.startStripeOnboarding);
router.get('/stripe/onboard/callback',   ...admin, ctrl.stripeOnboardingCallback);
router.get('/stripe/account',            ...admin, ctrl.getStripeAccountStatus);

// Misc
router.get('/audit-log', ...admin, ctrl.getAuditLog);
router.get('/export',    ...admin, ctrl.exportAllData);

module.exports = router;
