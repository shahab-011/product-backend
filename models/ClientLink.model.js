const mongoose = require('mongoose');

const ClientLinkSchema = new mongoose.Schema({
  lawyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  clientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'unlinked'],
    default: 'pending',
  },
  message: {
    type: String,
    default: '',
    maxlength: 500,
  },
  sharedDocuments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
  }],
  acceptedAt:  { type: Date, default: null },
  rejectedAt:  { type: Date, default: null },
}, { timestamps: true });

ClientLinkSchema.index({ lawyerId: 1, status: 1 });
ClientLinkSchema.index({ clientId: 1, status: 1 });
ClientLinkSchema.index({ clientEmail: 1, lawyerId: 1 }, { unique: true });

module.exports = mongoose.model('ClientLink', ClientLinkSchema);
