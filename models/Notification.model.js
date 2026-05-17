const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  type: {
    type: String,
    enum: [
      'task_assigned', 'task_due', 'invoice_paid', 'message_received',
      'document_uploaded', 'matter_assigned', 'lead_converted',
      'system_alert', 'ai_suggestion',
    ],
    required: true,
  },

  title:  { type: String, required: true, maxlength: 300 },
  body:   { type: String, maxlength: 1000 },
  icon:   { type: String },
  color:  { type: String, default: '#7C3AED' },
  link:   { type: String },

  relatedId:    { type: mongoose.Schema.Types.ObjectId },
  relatedModel: {
    type: String,
    enum: ['Matter', 'Invoice', 'Task', 'Lead', 'Message', 'Document', 'AISuggestion'],
  },

  isRead:  { type: Boolean, default: false, index: true },
  readAt:  { type: Date },

  deliveryChannels: [{ type: String, enum: ['in_app', 'email', 'sms', 'push'] }],
  deliveredVia:     [{ type: String, enum: ['in_app', 'email', 'sms', 'push'] }],
}, { timestamps: true });

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ firmId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
