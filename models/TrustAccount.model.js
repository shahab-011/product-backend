const mongoose = require('mongoose');

const TrustAccountSchema = new mongoose.Schema({
  firmId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  accountName:   { type: String, required: true, default: 'Client Trust Account' },
  bankName:      { type: String },
  accountNumber: { type: String },   // store last 4 digits only
  balance:       { type: Number, default: 0 },
  currency:      { type: String, default: 'PKR' },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('TrustAccount', TrustAccountSchema);
