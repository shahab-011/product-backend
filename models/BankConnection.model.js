const mongoose = require('mongoose');

const BankConnectionSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },

  // Plaid fields (null when added manually)
  plaidAccessToken: { type: String, select: false },
  plaidAccountId:   { type: String },
  plaidItemId:      { type: String },

  institutionName: { type: String, required: true },
  accountName:     { type: String, required: true },
  accountType:     { type: String, enum: ['checking', 'savings', 'credit', 'investment', 'other'], default: 'checking' },
  accountMask:     { type: String, maxlength: 10 },   // last 4 digits

  isActive:   { type: Boolean, default: true },
  isManual:   { type: Boolean, default: false },
  lastSyncAt: { type: Date },
  syncStatus: { type: String, enum: ['idle', 'syncing', 'error'], default: 'idle' },
  syncError:  { type: String },
}, { timestamps: true });

module.exports = mongoose.model('BankConnection', BankConnectionSchema);
