const mongoose = require('mongoose');

const CaseSchema = new mongoose.Schema(
  {
    lawyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Set when case is tied to a registered + linked client account
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    clientLinkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientLink',
      default: null,
    },
    // Always present — used for standalone cases too
    clientName:  { type: String, trim: true, maxlength: 100 },
    clientEmail: { type: String, lowercase: true, trim: true },
    title:       { type: String, required: [true, 'Case title is required'], trim: true, maxlength: 200 },
    caseType:    { type: String, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000 },
    notes:       { type: String, maxlength: 5000 },
    status: {
      type: String,
      enum: ['active', 'pending', 'in_review', 'on-hold', 'completed', 'closed', 'archived'],
      default: 'active',
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    documents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    }],
    closedAt:    { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

CaseSchema.index({ lawyerId: 1, status: 1 });
CaseSchema.index({ clientId: 1 });
CaseSchema.index({ lawyerId: 1, clientEmail: 1 });

module.exports = mongoose.model('Case', CaseSchema);
