const mongoose = require('mongoose');

const DirectMessageSchema = new mongoose.Schema({
  linkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientLink',
    required: true,
    index: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ['lawyer', 'client', 'user'], default: 'user' },
  text: { type: String, required: true, maxlength: 2000 },
  read: { type: Boolean, default: false },
}, { timestamps: true });

DirectMessageSchema.index({ linkId: 1, createdAt: -1 });

module.exports = mongoose.model('DirectMessage', DirectMessageSchema);
