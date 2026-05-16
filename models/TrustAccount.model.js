const mongoose = require('mongoose');

const ReconciliationSchema = new mongoose.Schema({
  date:              { type: Date, required: true },
  bankBalance:       { type: Number, required: true },
  reconciledBalance: { type: Number },
  ledgerTotal:       { type: Number },
  isBalanced:        { type: Boolean, default: false },
  notes:             { type: String },
  performedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: true, timestamps: false });

const TrustAccountSchema = new mongoose.Schema({
  firmId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  accountName:   { type: String, required: true, default: 'Client Trust Account' },
  bankName:      { type: String },
  accountNumber: { type: String },
  routingNumber: { type: String },
  balance:       { type: Number, default: 0 },
  currency:      { type: String, default: 'USD' },
  isActive:      { type: Boolean, default: true },
  isDefault:     { type: Boolean, default: false },
  reconciliations: [ReconciliationSchema],
}, { timestamps: true });

module.exports = mongoose.model('TrustAccount', TrustAccountSchema);
