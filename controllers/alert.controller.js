const Alert = require('../models/Alert.model');
const { sendSuccess, sendError } = require('../utils/response');

exports.getAlerts = async (req, res, next) => {
  try {
    const [alerts, unreadCount] = await Promise.all([
      Alert.find({ userId: req.user._id })
        .populate('documentId', 'originalName')
        .sort({ createdAt: -1 }),
      Alert.countDocuments({ userId: req.user._id, isRead: false }),
    ]);

    return sendSuccess(res, { alerts, unreadCount, total: alerts.length }, 'Alerts fetched');
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const alert = await Alert.findOne({ _id: req.params.id, userId: req.user._id });
    if (!alert) return sendError(res, 'Alert not found', 404);

    alert.isRead = true;
    await alert.save();

    return sendSuccess(res, { alert }, 'Alert marked as read');
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const result = await Alert.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );

    return sendSuccess(res, { modifiedCount: result.modifiedCount }, 'All alerts marked as read');
  } catch (err) {
    next(err);
  }
};

exports.deleteAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!alert) return sendError(res, 'Alert not found', 404);

    return sendSuccess(res, null, 'Alert deleted');
  } catch (err) {
    next(err);
  }
};
