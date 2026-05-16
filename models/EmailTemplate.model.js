const mongoose = require('mongoose');

const EmailTemplateSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name:      { type: String, required: true, trim: true, maxlength: 200 },
  subject:   { type: String, required: true, maxlength: 500 },
  body:      { type: String, required: true },
  variables: [{ type: String }],
  category:  { type: String, default: 'General', maxlength: 100 },
  usageCount:{ type: Number, default: 0 },
}, { timestamps: true });

EmailTemplateSchema.pre('save', function (next) {
  const matches = (this.body + ' ' + this.subject).match(/\{\{([^}]+)\}\}/g) || [];
  const extracted = [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '').trim()))];
  if (extracted.length) this.variables = extracted;
  next();
});

module.exports = mongoose.model('EmailTemplate', EmailTemplateSchema);
