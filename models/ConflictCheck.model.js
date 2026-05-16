const mongoose = require('mongoose');

const ConflictCheckSchema = new mongoose.Schema({
  firmId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  matterId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },

  searchTerms: [{
    type:  { type: String, enum: ['name', 'email', 'phone', 'company'] },
    value: { type: String },
  }],

  status: { type: String, enum: ['clear', 'conflict_found', 'waivable'], default: 'clear' },
  notes:  { type: String },

  results: {
    contacts:  [{ contactId: mongoose.Schema.Types.ObjectId, name: String, role: String, riskLevel: String }],
    matters:   [{ matterId: mongoose.Schema.Types.ObjectId, title: String, matterNumber: String, role: String, status: String, riskLevel: String }],
    leads:     [{ leadId: mongoose.Schema.Types.ObjectId, name: String, email: String, riskLevel: String }],
    documents: [{ documentId: mongoose.Schema.Types.ObjectId, name: String, match: String, riskLevel: String }],
  },

  conflictDetails: [{
    type:            { type: String },
    description:     { type: String },
    severity:        { type: String, enum: ['low', 'medium', 'high'] },
    relatedMatterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  }],

  hasConflict: { type: Boolean, default: false },
  riskLevel:   { type: String, enum: ['none', 'low', 'medium', 'high'], default: 'none' },

  resolution:       { type: String, enum: ['clear', 'waived', 'declined'] },
  resolutionNotes:  { type: String },
  waiverDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  waivedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  waivedAt:         { type: Date },

  reportPdfUrl: { type: String },
}, { timestamps: true });

ConflictCheckSchema.index({ firmId: 1, createdAt: -1 });

module.exports = mongoose.model('ConflictCheck', ConflictCheckSchema);
