const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  method:     { type: String, enum: ['POST','PUT','PATCH','DELETE'], required: true },
  path:       { type: String, required: true, maxlength: 500 },
  action:     { type: String, maxlength: 200 },   // e.g. "matter.update"
  resourceId: { type: mongoose.Schema.Types.ObjectId },
  model:      { type: String, maxlength: 100 },

  statusCode: { type: Number },
  ip:         { type: String, maxlength: 50 },
  userAgent:  { type: String, maxlength: 300 },

  reqBody:    { type: mongoose.Schema.Types.Mixed },   // sanitized subset
  diff:       { type: mongoose.Schema.Types.Mixed },   // before/after when available
}, { timestamps: true });

AuditLogSchema.index({ firmId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
