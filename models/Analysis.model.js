const mongoose = require('mongoose');

const MissingProtectionSchema = new mongoose.Schema({
  title:          { type: String },
  category:       { type: String, enum: ['Payment','IP','Termination','Privacy','Dispute','Data','Safety','Liability','Other'] },
  severity:       { type: String, enum: ['critical','high','medium','low'] },
  whatIsMissing:  { type: String },
  whyItMatters:   { type: String },
  defaultOutcome: { type: String },
  suggestedClause:{ type: String },
}, { _id: false });

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

    // Silence Detector fields
    missingProtections: { type: [MissingProtectionSchema], default: [] },
    silenceScore:       { type: Number, min: 0, max: 100, default: null },
    silenceSummary:     { type: String, default: '' },
    mostCriticalGap:    { type: String, default: '' },
    silenceAnalyzedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

AnalysisSchema.index({ userId: 1 });

module.exports = mongoose.model('Analysis', AnalysisSchema);
