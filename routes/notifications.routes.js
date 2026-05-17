const router = require('express').Router();
const ctrl   = require('../controllers/notifications.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Static routes BEFORE /:id
router.get('/unread-count',    ...auth, ctrl.getUnreadCount);
router.patch('/read-all',      ...auth, ctrl.markAllRead);
router.put('/preferences',     ...auth, ctrl.updatePreferences);

router.get('/',                ...auth, ctrl.listNotifications);
router.patch('/:id/read',      ...auth, ctrl.markRead);
router.delete('/:id',          ...auth, ctrl.deleteNotification);

module.exports = router;
