const mongoose = require('mongoose');
const OID = mongoose.Schema.Types.ObjectId;

const DocumentRequestSchema = new mongoose.Schema({
  firmId:      { type: OID, ref: 'User',             required: true, index: true },
  matterId:    { type: OID, ref: 'Matter' },
  requestedBy: { type: OID, ref: 'User',             required: true },
  clientId:    { type: OID, ref: 'Contact' },

  title:       { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, maxlength: 2000 },
  dueDate:     { type: Date },

  status:              { type: String, enum: ['pending','fulfilled','cancelled'], default: 'pending', index: true },
  fulfilledDocumentId: { type: OID, ref: 'PracticeDocument' },
  fulfilledAt:         { type: Date },
}, { timestamps: true });

DocumentRequestSchema.index({ firmId: 1, status: 1 });

module.exports = mongoose.model('DocumentRequest', DocumentRequestSchema);
