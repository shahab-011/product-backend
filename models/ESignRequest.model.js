const mongoose = require('mongoose');
const crypto = require('crypto');

const ESIGN_STATUSES = ['Draft','Pending','Partially Signed','Completed','Expired','Void'];

const SignatorySchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, lowercase: true },
  signed:   { type: Boolean, default: false },
  signedAt: { type: Date },
  token:    { type: String, default: () => crypto.randomBytes(20).toString('hex') },
}, { _id: false });

const AuditEntrySchema = new mongoose.Schema({
  event: { type: String, required: true },
  time:  { type: Date, default: Date.now },
  actor: { type: String },
}, { _id: false });

const ESignRequestSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },

  title:       { type: String, required: true, trim: true, maxlength: 300 },
  message:     { type: String, maxlength: 1000 },
  status:      { type: String, enum: ESIGN_STATUSES, default: 'Pending' },
  expiresAt:   { type: Date },

  signatories: [SignatorySchema],
  auditTrail:  [AuditEntrySchema],
}, { timestamps: true });

// Auto-set expiresAt to 30 days from creation
ESignRequestSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    this.expiresAt = d;
  }
  // Recompute status from signatories
  if (this.signatories.length > 0 && !['Void','Expired','Completed'].includes(this.status)) {
    const signedCount = this.signatories.filter(s => s.signed).length;
    if (signedCount === 0)                       this.status = 'Pending';
    else if (signedCount < this.signatories.length) this.status = 'Partially Signed';
    else                                          this.status = 'Completed';
  }
  next();
});

ESignRequestSchema.index({ firmId: 1, status: 1 });

module.exports = mongoose.model('ESignRequest', ESignRequestSchema);
