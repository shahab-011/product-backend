const mongoose = require('mongoose');
const crypto   = require('crypto');

const FieldSchema = new mongoose.Schema({
  id:          { type: String, default: () => crypto.randomBytes(8).toString('hex') },
  type:        { type: String, enum: ['text','email','phone','dropdown','checkbox','date','textarea','file','heading','paragraph'], required: true },
  label:       { type: String, required: true },
  placeholder: { type: String },
  helpText:    { type: String },
  isRequired:  { type: Boolean, default: false },
  options:     [{ type: String }],
  conditionalLogic: {
    dependsOnFieldId: String,
    condition:        { type: String, enum: ['equals','not_equals','contains','not_empty'] },
    value:            String,
  },
  order: { type: Number, default: 0 },
}, { _id: false });

const IntakeFormSchema = new mongoose.Schema({
  firmId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:           { type: String, required: true, trim: true, maxlength: 200 },
  practiceAreas:  [{ type: String }],
  description:    { type: String, maxlength: 1000 },
  fields:         [FieldSchema],
  steps:          [{ title: String, fieldIds: [String] }],
  successMessage: { type: String, default: 'Thank you! We will be in touch shortly.' },
  redirectUrl:    { type: String },
  isActive:       { type: Boolean, default: true },
  slug:           { type: String, unique: true, sparse: true },
  reCaptchaEnabled: { type: Boolean, default: false },
  usageCount:     { type: Number, default: 0 },
  isDeleted:      { type: Boolean, default: false },
}, { timestamps: true });

IntakeFormSchema.pre('save', function (next) {
  if (!this.slug) {
    const base = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    this.slug = base + '-' + crypto.randomBytes(4).toString('hex');
  }
  next();
});

module.exports = mongoose.model('IntakeForm', IntakeFormSchema);
