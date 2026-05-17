const Notification  = require('../models/Notification.model');
const FirmSettings  = require('../models/FirmSettings.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

/* ── 1. List (paginated, unread first) ──────────────────────────────── */
exports.listNotifications = async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const userId = req.user._id;
  const skip   = (Number(page) - 1) * Number(limit);

  const filter = { userId };
  if (unreadOnly === 'true') filter.isRead = false;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ isRead: 1, createdAt: -1 })  // unread first, then newest
      .skip(skip).limit(Number(limit)).lean(),
    Notification.countDocuments(filter),
  ]);

  sendSuccess(res, { notifications, total, page: Number(page) }, 'Notifications fetched');
};

/* ── 2. Unread count ────────────────────────────────────────────────── */
exports.getUnreadCount = async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  sendSuccess(res, { count }, 'Unread count');
};

/* ── 3. Mark single as read ─────────────────────────────────────────── */
exports.markRead = async (req, res) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notif) return sendError(res, 'Notification not found', 404);

  // Emit update to user's socket room
  req.app.get('io')?.to(`user_${req.user._id}`).emit('notification:read', { notificationId: notif._id });

  sendSuccess(res, notif, 'Marked as read');
};

/* ── 4. Mark all as read ────────────────────────────────────────────── */
exports.markAllRead = async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  req.app.get('io')?.to(`user_${req.user._id}`).emit('notification:read-all');

  sendSuccess(res, { modified: result.modifiedCount }, 'All notifications marked as read');
};

/* ── 5. Delete ──────────────────────────────────────────────────────── */
exports.deleteNotification = async (req, res) => {
  const notif = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!notif) return sendError(res, 'Notification not found', 404);
  sendSuccess(res, { deleted: true }, 'Notification deleted');
};

/* ── 6. Update preferences (stored in FirmSettings.notifications) ───── */
exports.updatePreferences = async (req, res) => {
  const firmId = getFirmId(req);
  const { email = {}, inApp = {} } = req.body;

  const update = {};
  Object.entries(email).forEach(([k, v]) => { update[`notifications.email.${k}`] = Boolean(v); });
  Object.entries(inApp).forEach(([k, v]) => { update[`notifications.inApp.${k}`]  = Boolean(v); });

  const settings = await FirmSettings.findOneAndUpdate(
    { firmId },
    { $set: update },
    { new: true, upsert: true, select: 'notifications' }
  );

  sendSuccess(res, settings.notifications, 'Preferences updated');
};
