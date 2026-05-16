const mongoose = require('mongoose');

const CONTACT_TYPES = [
  'client','prospect','opposing_party','opposing_counsel',
  'witness','court','expert','vendor','company','other',
];

const AddressSchema = new mongoose.Schema({
  label:      { type: String, default: 'home' },
  street:     String,
  city:       String,
  state:      String,
  country:    { type: String, default: 'Pakistan' },
  postalCode: String,
  isPrimary:  { type: Boolean, default: false },
}, { _id: false });

const ContactSchema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  type:    { type: String, enum: CONTACT_TYPES, default: 'client' },
  subType: { type: String, maxlength: 100 },

  firstName: { type: String, trim: true, maxlength: 100 },
  lastName:  { type: String, trim: true, maxlength: 100 },
  company:   { type: String, trim: true, maxlength: 200 },
  jobTitle:  { type: String, trim: true, maxlength: 150 },

  email:          { type: String, trim: true, lowercase: true },
  alternateEmail: { type: String, trim: true, lowercase: true },
  phone:          { type: String, trim: true },
  mobile:         { type: String, trim: true },
  fax:            { type: String, trim: true },

  dateOfBirth:           { type: Date },
  gender:                { type: String, enum: ['male','female','non-binary','prefer_not_to_say',''] },
  preferredLanguage:     { type: String, default: 'English' },
  preferredContactMethod:{ type: String, enum: ['email','phone','text','any'], default: 'email' },

  addresses:  [AddressSchema],
  website:    { type: String, trim: true },
  linkedIn:   { type: String, trim: true },
  taxId:      { type: String, trim: true },
  barNumber:  { type: String, trim: true },

  tags:         [String],
  customFields: { type: Map, of: String, default: {} },

  isActive:  { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },

  notes: { type: String, maxlength: 10000 },

  relatedMatters:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Matter' }],
  linkedCompanyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },

  ledesClientId:         { type: String, trim: true },
  billingRate:           { type: Number },
  billingRateOverride:   { type: Boolean, default: false },

  importSource: { type: String, enum: ['manual','csv','google','outlook'], default: 'manual' },
  importedAt:   { type: Date },
  lastContactDate: { type: Date },
}, { timestamps: true });

ContactSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ') || this.company || 'Unknown';
});

ContactSchema.set('toJSON',   { virtuals: true });
ContactSchema.set('toObject', { virtuals: true });

ContactSchema.index({ firmId: 1, email: 1 });
ContactSchema.index({ firmId: 1, type: 1 });
ContactSchema.index({ firmId: 1, isDeleted: 1 });

module.exports = mongoose.model('Contact', ContactSchema);
