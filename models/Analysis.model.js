const mongoose = require('mongoose');

const ClauseSchema = new mongoose.Schema({
  type: { type: String },
  originalText: { type: String },
  plainEnglish: { type: String },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
  confidence: { type: Number },
});

const RiskSchema = new mongoose.Schema({
  title: { type: String },
  description: { type: String },
  severity: { type: String, enum: ['low', 'medium', 'high'] },
  clauseRef: { type: String },
  recommendation: { type: String },
});

const ComplianceSchema = new mongoose.Schema({
  score: { type: Number },
  mandatoryClauses: { type: Boolean },
  missingClauses: [{ type: String }],
  signaturePresent: { type: Boolean },
  datesValid: { type: Boolean },
  jurisdictionValid: { type: Boolean },
  jurisdictionDetected: { type: String },
});

const AnalysisSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      unique: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    summary: { type: String },
    clauses: [ClauseSchema],
    risks: [RiskSchema],
    compliance: { type: ComplianceSchema },
    healthScore: { type: Number, min: 0, max: 100 },
    confidenceScore: { type: Number, min: 0, max: 100 },
    detectedDocType: { type: String },
    detectedJurisdiction: { type: String },
    expiryDate: { type: Date },
    renewalDate: { type: Date },
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AnalysisSchema.index({ documentId: 1 }, { unique: true });
AnalysisSchema.index({ userId: 1 });

module.exports = mongoose.model('Analysis', AnalysisSchema);
