const mongoose = require('mongoose');

const TRANSACTION_TYPES = ['deposit','transfer_to_operating','withdrawal','refund'];

const TrustTransactionSchema = new mongoose.Schema({
  trustAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrustAccount', required: true, index: true },
  firmId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matterId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  performedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  type:          { type: String, enum: TRANSACTION_TYPES, required: true },
  amount:        { type: Number, required: true, min: 0.01 },
  description:   { type: String, maxlength: 500 },
  date:          { type: Date, default: Date.now },
  balanceAfter:  { type: Number },   // running balance snapshot
}, { timestamps: true });

TrustTransactionSchema.index({ trustAccountId: 1, date: -1 });

module.exports = mongoose.model('TrustTransaction', TrustTransactionSchema);
