const mongoose = require('mongoose');
const crypto   = require('crypto');

const STATUSES = ['draft', 'pending', 'partially_signed', 'completed', 'expired', 'void'];
const ROLES    = ['client', 'co_client', 'attorney', 'witness', 'third_party'];

const SignatorySchema = new mongoose.Schema({
  name:            { type: String, required: true },
  email:           { type: String, required: true, lowercase: true },
  role:            { type: String, enum: ROLES, default: 'client' },
  phone:           String,
  signingOrder:    { type: Number, default: 1 },
  token:           { type: String, default: () => crypto.randomBytes(32).toString('hex') },
  status:          { type: String, enum: ['pending', 'signed', 'declined'], default: 'pending' },
  signedAt:        Date,
  signedIp:        String,
  signedUserAgent: String,
  signatureData:   String, // base64 PNG
  declineReason:   String,
});

const AuditEntrySchema = new mongoose.Schema({
  event:      { type: String, required: true },
  actor:      String,
  actorEmail: String,
  ip:         String,
  userAgent:  String,
  time:       { type: Date, default: Date.now },
  details:    String,
}, { _id: false });

const ESignRequestSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  documentId:{ type: mongoose.Schema.Types.ObjectId, ref: 'PracticeDocument' },

  title:       { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, maxlength: 1000 },
  signingMode: { type: String, enum: ['sequential', 'parallel'], default: 'parallel' },
  status:      { type: String, enum: STATUSES, default: 'draft' },
  expiresAt:   Date,

  completedAt:       Date,
  voidedAt:          Date,
  voidReason:        String,
  voidedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  signedDocumentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'PracticeDocument' },
  documentHash:      String, // SHA-256 of original
  signedDocumentHash:String, // SHA-256 of signed copy

  signatories:       [SignatorySchema],
  auditTrail:        [AuditEntrySchema],
  reminderSchedule:  [{ dayAfterSend: Number, sentAt: Date }],
}, { timestamps: true });

// Auto-set expiresAt to 30 days from creation
ESignRequestSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    this.expiresAt = d;
  }
  // Recompute status from signatories (don't override terminal states)
  if (this.signatories.length > 0 && !['void', 'expired', 'completed'].includes(this.status)) {
    const signedCount   = this.signatories.filter(s => s.status === 'signed').length;
    const declinedCount = this.signatories.filter(s => s.status === 'declined').length;
    if (signedCount === 0 && declinedCount === 0) {
      this.status = 'pending';
    } else if (signedCount === this.signatories.length) {
      this.status = 'completed';
      if (!this.completedAt) this.completedAt = new Date();
    } else if (declinedCount > 0) {
      this.status = 'void'; // any decline voids the request
    } else {
      this.status = 'partially_signed';
    }
  }
  next();
});

ESignRequestSchema.index({ firmId: 1, status: 1 });
ESignRequestSchema.index({ 'signatories.token': 1 });

module.exports = mongoose.model('ESignRequest', ESignRequestSchema);
module.exports.ROLES = ROLES;
