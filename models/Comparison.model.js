const mongoose = require('mongoose');

const ModificationSchema = new mongoose.Schema(
  {
    clauseName: { type: String, default: '' },
    before:     { type: String, default: '' },
    after:      { type: String, default: '' },
    impact:     { type: String, default: '' },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
    },
  },
  { _id: false }
);

const ComparisonSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    docAId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: [true, 'Document A ID is required'],
    },
    docBId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: [true, 'Document B ID is required'],
    },
    summary:        { type: String,           default: '' },
    additions:      { type: [String],         default: [] },
    removals:       { type: [String],         default: [] },
    modifications:  { type: [ModificationSchema], default: [] },
    riskChange: {
      type: String,
      enum: ['improved', 'worsened', 'neutral'],
      default: 'neutral',
    },
    recommendation: { type: String, default: '' },
  },
  { timestamps: true }
);

ComparisonSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Comparison', ComparisonSchema);
