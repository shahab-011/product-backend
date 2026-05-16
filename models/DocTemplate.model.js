const mongoose = require('mongoose');

const TEMPLATE_CATEGORIES = [
  'NDA', 'Retainer Agreement', 'Engagement Letter', 'Demand Letter',
  'Settlement Agreement', 'Lease', 'Employment Contract', 'Corporate Resolution',
  'Court Motion', 'Pleading', 'Discovery', 'Custom',
];

const PRACTICE_AREAS = [
  'Family Law', 'Criminal Law', 'Corporate', 'Real Estate', 'Immigration',
  'Personal Injury', 'IP', 'Employment', 'Estate Planning', 'Bankruptcy', 'Tax', 'General',
];

const FieldSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  label:        String,
  type:         { type: String, enum: ['text', 'date', 'number', 'email', 'phone', 'textarea'], default: 'text' },
  defaultValue: String,
  isRequired:   { type: Boolean, default: false },
}, { _id: false });

const VersionSchema = new mongoose.Schema({
  versionNumber: Number,
  content:       String,
  fields:        [FieldSchema],
  updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt:     { type: Date, default: Date.now },
  note:          String,
});

const DocTemplateSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  name:           { type: String, required: true, trim: true, maxlength: 200 },
  category:       { type: String, enum: TEMPLATE_CATEGORIES, default: 'Custom' },
  practiceAreas:  [String],
  description:    { type: String, maxlength: 500 },
  content:        { type: String, required: true },
  contentDelta:   mongoose.Schema.Types.Mixed,
  fields:         [FieldSchema],
  outputFormats:  { type: [String], default: ['docx', 'pdf'] },
  isPublic:       { type: Boolean, default: false },
  isFavorite:     { type: Boolean, default: false },
  isActive:       { type: Boolean, default: true },
  usageCount:     { type: Number, default: 0 },
  lastUsedAt:     Date,
  versions:       [VersionSchema],
  currentVersion: { type: Number, default: 1 },
  wordTemplateUrl: String,
}, { timestamps: true });

// Auto-extract / sync fields from content placeholders
DocTemplateSchema.pre('save', function (next) {
  if (this.isModified('content')) {
    const matches = (this.content || '').match(/\{\{(\w+)\}\}/g) || [];
    const names   = [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
    const existing = new Map(this.fields.map(f => [f.name, f]));
    // Keep existing field metadata, add new ones, remove obsolete
    this.fields = names.map(name => existing.get(name) || {
      name,
      label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      type:  'text',
    });
  }
  next();
});

DocTemplateSchema.index({ firmId: 1, category: 1 });
DocTemplateSchema.index({ firmId: 1, isFavorite: 1 });
DocTemplateSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('DocTemplate', DocTemplateSchema);
module.exports.TEMPLATE_CATEGORIES = TEMPLATE_CATEGORIES;
module.exports.PRACTICE_AREAS = PRACTICE_AREAS;
