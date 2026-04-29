const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    alertType: {
      type: String,
      enum: ['expiry', 'renewal', 'risk', 'compliance', 'info'],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ['high', 'medium', 'low', 'info'], default: 'info' },
    isRead: { type: Boolean, default: false },
    scheduledFor: { type: Date },
  },
  { timestamps: true }
);

AlertSchema.index({ userId: 1, isRead: 1 });
AlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

module.exports = mongoose.model('Alert', AlertSchema);
