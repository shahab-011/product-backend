const mongoose = require('mongoose');
const crypto   = require('crypto');

const ClientPortalAccessSchema = new mongoose.Schema({
  firmId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },

  email:        { type: String, required: true, lowercase: true, trim: true },
  accessToken:  { type: String, default: () => crypto.randomBytes(32).toString('hex'), index: true },
  isActive:     { type: Boolean, default: true },
  lastAccessAt: Date,

  // OTP flow
  otpCode:     String,
  otpExpires:  Date,
  otpAttempts: { type: Number, default: 0 },

  // Customisation
  sessionTimeout: { type: Number, default: 15 }, // minutes
  invitedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

ClientPortalAccessSchema.index({ firmId: 1, email: 1 });

module.exports = mongoose.model('ClientPortalAccess', ClientPortalAccessSchema);
