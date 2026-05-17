const Notification = require('../models/Notification.model');
const emailSvc     = require('./email.service');

/* Type metadata — icon + color used in in-app and email */
const TYPE_META = {
  task_assigned:      { icon: '📋', color: '#3B82F6' },
  task_due:           { icon: '⏰', color: '#F59E0B' },
  invoice_paid:       { icon: '💰', color: '#10B981' },
  message_received:   { icon: '💬', color: '#7C3AED' },
  document_uploaded:  { icon: '📄', color: '#6B7280' },
  matter_assigned:    { icon: '⚖️',  color: '#4F46E5' },
  lead_converted:     { icon: '🎯', color: '#EC4899' },
  system_alert:       { icon: '🔔', color: '#EF4444' },
  ai_suggestion:      { icon: '🤖', color: '#8B5CF6' },
};

/**
 * Create + deliver a notification.
 *
 * @param {object} opts
 * @param {string|ObjectId} opts.firmId
 * @param {string|ObjectId} opts.userId       - recipient
 * @param {string}          opts.type         - NotificationSchema.type enum
 * @param {string}          opts.title
 * @param {string}          [opts.body]
 * @param {string}          [opts.link]       - deep link
 * @param {string|ObjectId} [opts.relatedId]
 * @param {string}          [opts.relatedModel]
 * @param {string[]}        [opts.channels]   - default ['in_app']
 * @param {object}          [opts.io]         - Socket.io server instance
 * @param {string}          [opts.recipientEmail]
 */
async function notify(opts) {
  const {
    firmId, userId, type, title, body = '', link,
    relatedId, relatedModel,
    channels = ['in_app'],
    io,
    recipientEmail,
  } = opts;

  const meta = TYPE_META[type] || { icon: '🔔', color: '#7C3AED' };

  let notif;
  try {
    notif = await Notification.create({
      firmId, userId, type, title, body, link,
      relatedId, relatedModel,
      icon:             meta.icon,
      color:            meta.color,
      deliveryChannels: channels,
      deliveredVia:     [],
    });
  } catch (e) {
    console.error('[notification.service] DB create failed:', e.message);
    return null;
  }

  const delivered = [];

  // ── In-app: emit via Socket.io to personal user room ────────────────
  if (channels.includes('in_app') && io) {
    try {
      io.to(`user_${userId}`).emit('notification:new', notif.toObject());
      delivered.push('in_app');
    } catch (e) {
      console.error('[notification.service] socket emit failed:', e.message);
    }
  }

  // ── Email ────────────────────────────────────────────────────────────
  const highPriorityTypes = ['invoice_paid', 'message_received', 'lead_converted', 'task_assigned'];
  if (channels.includes('email') && recipientEmail && highPriorityTypes.includes(type)) {
    const sent = await emailSvc.sendNotificationEmail(recipientEmail, { title, body, link });
    if (sent) delivered.push('email');
  }

  // ── SMS stub (Twilio — requires TWILIO_* env vars) ───────────────────
  if (channels.includes('sms') && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({
        body: `${title}: ${body}`,
        from: process.env.TWILIO_FROM,
        to:   opts.recipientPhone,
      });
      delivered.push('sms');
    } catch (e) {
      console.error('[notification.service] SMS failed:', e.message);
    }
  }

  // Update deliveredVia
  if (delivered.length) {
    await Notification.updateOne({ _id: notif._id }, { $addToSet: { deliveredVia: { $each: delivered } } });
  }

  return notif;
}

/**
 * Bulk-notify multiple users (e.g. firm-wide system alerts).
 */
async function notifyMany(userIds, opts, io) {
  return Promise.all(userIds.map(uid => notify({ ...opts, userId: uid, io })));
}

module.exports = { notify, notifyMany, TYPE_META };
