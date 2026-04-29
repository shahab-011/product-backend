const mongoose = require('mongoose');

const CaseSchema = new mongoose.Schema(
  {
    lawyerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    clientName:  { type: String, required: true, trim: true, maxlength: 100 },
    clientEmail: { type: String, required: true, lowercase: true },
    caseType:    { type: String, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000 },
    notes:       { type: String, maxlength: 5000 },
    status:      { type: String, enum: ['active', 'pending', 'on-hold', 'closed'], default: 'active' },
    priority:    { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    closedAt:    { type: Date },
  },
  { timestamps: true }
);

CaseSchema.index({ lawyerId: 1, status: 1 });
CaseSchema.index({ lawyerId: 1, clientEmail: 1 });

module.exports = mongoose.model('Case', CaseSchema);
