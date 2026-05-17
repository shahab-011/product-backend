const mongoose = require('mongoose');
const OID = mongoose.Schema.Types.ObjectId;

const TrustPaymentRequestSchema = new mongoose.Schema({
  firmId:         { type: OID, ref: 'User',         required: true, index: true },
  trustAccountId: { type: OID, ref: 'TrustAccount', required: true },
  matterId:       { type: OID, ref: 'Matter' },
  requestedBy:    { type: OID, ref: 'User' },

  clientEmail: { type: String, required: true, lowercase: true },
  clientName:  { type: String },
  amount:      { type: Number, required: true, min: 0.01 },
  description: { type: String, maxlength: 1000 },
  message:     { type: String, maxlength: 2000 },

  token:     { type: String, required: true, unique: true, index: true },
  status:    { type: String, enum: ['pending', 'paid', 'expired', 'cancelled'], default: 'pending' },
  expiresAt: { type: Date, required: true },
  paidAt:    { type: Date },
  paidVia:   { type: String },
}, { timestamps: true });

module.exports = mongoose.model('TrustPaymentRequest', TrustPaymentRequestSchema);
