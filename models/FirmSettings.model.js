const mongoose = require('mongoose');

const TeamMemberSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name:     { type: String, required: true },
  email:    { type: String, required: true, lowercase: true },
  role:     { type: String, enum: ['admin','lawyer','paralegal','client','viewer'], default: 'lawyer' },
  status:   { type: String, enum: ['active','inactive','pending'], default: 'pending' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: true });

const NotificationPrefsSchema = new mongoose.Schema({
  newLead:             { type: Boolean, default: true },
  matterUpdate:        { type: Boolean, default: true },
  invoicePaid:         { type: Boolean, default: true },
  taskDue:             { type: Boolean, default: true },
  appointmentReminder: { type: Boolean, default: true },
  documentShared:      { type: Boolean, default: false },
  systemUpdates:       { type: Boolean, default: false },
  weeklyReport:        { type: Boolean, default: true },
}, { _id: false });

const FirmSettingsSchema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  // Onboarding
  onboardingComplete: { type: Boolean, default: false },
  plan:      { type: String, enum: ['free', 'starter', 'advanced', 'expand'], default: 'free' },
  firmSize:  { type: String, enum: ['solo', '2-5', '6-20', '20+'], default: 'solo' },
  country:   { type: String, default: 'Pakistan' },
  practiceAreas: { type: [String], default: [] },

  // Firm profile
  name:         { type: String, default: 'My Law Firm' },
  address:      { type: String },
  phone:        { type: String },
  email:        { type: String, lowercase: true },
  website:      { type: String },
  barNumber:    { type: String },
  jurisdiction: { type: String },
  taxId:        { type: String },
  description:  { type: String, maxlength: 1000 },
  logo:         { type: String },   // base64 or URL

  // Billing defaults
  currency:         { type: String, default: 'PKR' },
  defaultHourlyRate:{ type: Number, default: 0 },
  defaultTaxRate:   { type: Number, default: 0 },
  invoicePrefix:    { type: String, default: 'INV' },
  paymentTermsDays: { type: Number, default: 30 },
  lateFeePercent:   { type: Number, default: 0 },
  trustAccountBank: { type: String },

  teamMembers: [TeamMemberSchema],
  notifications: { type: NotificationPrefsSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('FirmSettings', FirmSettingsSchema);
