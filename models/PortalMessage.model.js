const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  name:       String,
  url:        String,
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PracticeDocument' },
}, { _id: false });

const PortalMessageSchema = new mongoose.Schema({
  firmId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
  matterId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  clientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  portalId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ClientPortalAccess', index: true },

  senderType: { type: String, enum: ['firm', 'client'], required: true },
  senderId:   mongoose.Schema.Types.ObjectId, // User _id for firm, Contact _id for client
  senderName: String,

  body:        { type: String, required: true },
  attachments: [AttachmentSchema],

  readByFirm:   { type: Boolean, default: false },
  readByClient: { type: Boolean, default: false },
  readAt:       [{ userId: mongoose.Schema.Types.ObjectId, readAt: Date }],
}, { timestamps: true });

PortalMessageSchema.index({ portalId: 1, createdAt: -1 });
PortalMessageSchema.index({ firmId: 1, matterId: 1 });

module.exports = mongoose.model('PortalMessage', PortalMessageSchema);
