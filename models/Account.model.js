const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  code:    { type: String, required: true, maxlength: 20 },
  name:    { type: String, required: true, maxlength: 200 },
  type:    { type: String, enum: ['asset', 'liability', 'equity', 'revenue', 'expense'], required: true },
  subType: { type: String, maxlength: 100 },

  description: { type: String, maxlength: 500 },
  balance:     { type: Number, default: 0 },   // running balance, updated on every posted entry

  isDefault:        { type: Boolean, default: false },
  isBank:           { type: Boolean, default: false },
  isActive:         { type: Boolean, default: true },
  isTaxCategory:    { type: Boolean, default: false },
  taxCategoryLabel: { type: String },

  bankConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankConnection' },
}, { timestamps: true });

AccountSchema.index({ firmId: 1, code: 1 }, { unique: true });
AccountSchema.index({ firmId: 1, type: 1 });

module.exports = mongoose.model('Account', AccountSchema);
