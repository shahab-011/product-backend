const mongoose = require('mongoose');

const ModSchema = new mongoose.Schema({
  clauseName: { type: String },
  before: { type: String },
  after: { type: String },
  impact: { type: String },
  severity: { type: String, enum: ['low', 'medium', 'high'] },
});

const ComparisonSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    docAId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    docBId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    summary: { type: String },
    additions: [{ type: String }],
    removals: [{ type: String }],
    modifications: [ModSchema],
    riskChange: { type: String, enum: ['improved', 'worsened', 'neutral'] },
    recommendation: { type: String },
  },
  { timestamps: true }
);

ComparisonSchema.index({ userId: 1 });

module.exports = mongoose.model('Comparison', ComparisonSchema);
