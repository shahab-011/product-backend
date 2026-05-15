const mongoose = require('mongoose');

const TEMPLATE_CATEGORIES = [
  'NDA','Retainer','Employment','Lease','Settlement','Corporate','Custom',
];

const DocTemplateSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  name:        { type: String, required: true, trim: true, maxlength: 200 },
  category:    { type: String, enum: TEMPLATE_CATEGORIES, default: 'Custom' },
  description: { type: String, maxlength: 500 },
  content:     { type: String, required: true },
  fields:      [String],       // extracted {{placeholder}} names
  usageCount:  { type: Number, default: 0 },
}, { timestamps: true });

// Auto-extract fields from content
DocTemplateSchema.pre('save', function (next) {
  const matches = this.content.match(/\{\{(\w+)\}\}/g) || [];
  this.fields = [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  next();
});

DocTemplateSchema.index({ firmId: 1, category: 1 });

module.exports = mongoose.model('DocTemplate', DocTemplateSchema);
