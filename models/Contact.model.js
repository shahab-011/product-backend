const mongoose = require('mongoose');

const CONTACT_TYPES = [
  'client','opposing_party','opposing_counsel','witness',
  'court','expert','vendor','company','other',
];

const AddressSchema = new mongoose.Schema({
  street: String, city: String, state: String,
  country: { type: String, default: 'Pakistan' },
  postalCode: String,
}, { _id: false });

const ContactSchema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  type:      { type: String, enum: CONTACT_TYPES, default: 'client' },
  firstName: { type: String, trim: true, maxlength: 100 },
  lastName:  { type: String, trim: true, maxlength: 100 },
  company:   { type: String, trim: true, maxlength: 200 },

  email:  { type: String, trim: true, lowercase: true },
  phone:  { type: String, trim: true },
  mobile: { type: String, trim: true },

  address:   AddressSchema,
  barNumber: { type: String },          // for lawyers / counsel

  notes:    { type: String, maxlength: 5000 },
  tags:     [String],
  isActive: { type: Boolean, default: true },

  relatedMatters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Matter' }],
}, { timestamps: true });

// Virtual full name
ContactSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ') || this.company || 'Unknown';
});

ContactSchema.set('toJSON', { virtuals: true });
ContactSchema.set('toObject', { virtuals: true });

ContactSchema.index({ firmId: 1, email: 1 });
ContactSchema.index({ firmId: 1, type: 1 });

module.exports = mongoose.model('Contact', ContactSchema);
