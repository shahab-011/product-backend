const router = require('express').Router();
const ctrl   = require('../controllers/firm.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth  = [protect, authorize('lawyer', 'admin')];
const admin = [protect, authorize('admin')];

router.get('/',    ...auth, ctrl.getSettings);
router.put('/',    ...auth, ctrl.updateSettings);

router.get('/team',                     ...auth,  ctrl.listTeam);
router.post('/team/invite',             ...admin, ctrl.inviteMember);
router.put('/team/:memberId',           ...admin, ctrl.updateMember);
router.delete('/team/:memberId',        ...admin, ctrl.removeMember);
router.patch('/team/:memberId/toggle',  ...admin, ctrl.toggleMemberStatus);

router.put('/notifications', ...auth, ctrl.updateNotifications);

module.exports = router;
