const mongoose = require('mongoose');

const TYPES = ['deposit', 'disbursement', 'transfer_to_operating', 'refund', 'adjustment'];

const TrustTransactionSchema = new mongoose.Schema({
  trustAccountId:    { type: mongoose.Schema.Types.ObjectId, ref: 'TrustAccount', required: true, index: true },
  firmId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matterId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  clientId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  performedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  type:          { type: String, enum: TYPES, required: true },
  amount:        { type: Number, required: true, min: 0.01 },
  description:   { type: String, maxlength: 500 },
  date:          { type: Date, default: Date.now },
  checkNumber:   { type: String },
  payee:         { type: String },
  balanceAfter:  { type: Number },

  receiptUrl:           { type: String },
  relatedInvoiceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  relatedTimeEntryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'TimeEntry' },

  isVoided:   { type: Boolean, default: false },
  voidedAt:   { type: Date },
  voidReason: { type: String },
}, { timestamps: true });

TrustTransactionSchema.index({ trustAccountId: 1, date: -1 });
TrustTransactionSchema.index({ firmId: 1, matterId: 1 });

module.exports = mongoose.model('TrustTransaction', TrustTransactionSchema);
