const mongoose = require('mongoose');
const OID = mongoose.Schema.Types.ObjectId;

const TeamMemberSchema = new mongoose.Schema({
  userId:       { type: OID, ref: 'User' },
  name:         { type: String, required: true },
  email:        { type: String, required: true, lowercase: true },
  role:         { type: String, enum: ['owner','admin','attorney','paralegal','staff','lawyer','client','viewer'], default: 'attorney' },
  customRoleId: { type: OID, ref: 'CustomRole' },
  status:       { type: String, enum: ['active','inactive','invited'], default: 'invited' },
  invitedAt:    { type: Date },
  inviteToken:  { type: String },
  joinedAt:     { type: Date },
  billingRate:  { type: Number, default: 0 },
  initials:     { type: String, maxlength: 4 },
  signature:    { type: String },
}, { _id: true });

const NotificationPrefsSchema = new mongoose.Schema({
  newLead:             { type: Boolean, default: true },
  taskDue:             { type: Boolean, default: true },
  appointmentReminder: { type: Boolean, default: true },
  invoicePaid:         { type: Boolean, default: true },
  trustDeposit:        { type: Boolean, default: true },
  documentUploaded:    { type: Boolean, default: false },
  messageReceived:     { type: Boolean, default: true },
  matterAssigned:      { type: Boolean, default: true },
  systemAlerts:        { type: Boolean, default: true },
  matterUpdate:        { type: Boolean, default: true },
  documentShared:      { type: Boolean, default: false },
  weeklyReport:        { type: Boolean, default: true },
  systemUpdates:       { type: Boolean, default: false },
}, { _id: false });

const PracticeAreaConfigSchema = new mongoose.Schema({
  name:              { type: String, required: true },
  color:             { type: String, default: '#7C3AED' },
  defaultBillingType:{ type: String, enum: ['hourly','flat_fee','contingency','retainer','pro_bono'], default: 'hourly' },
  defaultHourlyRate: { type: Number, default: 0 },
  stages:            [{ type: String }],
}, { _id: true });

const FirmSettingsSchema = new mongoose.Schema({
  firmId: { type: OID, ref: 'User', required: true, unique: true },

  onboardingComplete: { type: Boolean, default: false },
  plan:      { type: String, enum: ['free','starter','advanced','expand'], default: 'free' },
  firmSize:  { type: String, enum: ['solo','2-5','6-20','20+'], default: 'solo' },
  country:   { type: String, default: 'Pakistan' },

  /* ── Firm profile (flat for backward compat) ── */
  name:         { type: String, default: 'My Law Firm' },
  address:      { type: String },
  phone:        { type: String },
  email:        { type: String, lowercase: true },
  supportEmail: { type: String, lowercase: true },
  website:      { type: String },
  barNumber:    { type: String },
  jurisdiction: { type: String },
  jurisdictions:[{ type: String }],
  taxId:        { type: String },
  description:  { type: String, maxlength: 1000 },
  logo:         { type: String },
  timeZone:     { type: String, default: 'Asia/Karachi' },

  /* ── Billing (flat legacy + structured) ── */
  currency:          { type: String, default: 'PKR' },
  defaultHourlyRate: { type: Number, default: 0 },
  defaultTaxRate:    { type: Number, default: 0 },
  invoicePrefix:     { type: String, default: 'INV' },
  invoiceNumberNext: { type: Number, default: 1 },
  paymentTermsDays:  { type: Number, default: 30 },
  lateFeePercent:    { type: Number, default: 0 },
  graceperiodDays:   { type: Number, default: 0 },
  trustAccountBank:  { type: String },
  allowPartialPayment:    { type: Boolean, default: true },
  showRatesOnInvoice:     { type: Boolean, default: true },
  showTimekeeperNames:    { type: Boolean, default: true },
  showEntryDates:         { type: Boolean, default: true },
  stripeAccountId:        { type: String },
  stripeOnboarded:        { type: Boolean, default: false },

  /* ── Security ── */
  security: {
    enforce2FA:            { type: Boolean, default: false },
    sessionTimeoutMinutes: { type: Number, default: 60 },
    ipAllowlist:           [{ type: String }],
  },

  /* ── Integrations ── */
  integrations: {
    googleConnected:     { type: Boolean, default: false },
    googleRefreshToken:  { type: String },
    googleCalendarId:    { type: String },
    outlookConnected:    { type: Boolean, default: false },
    outlookRefreshToken: { type: String },
    quickbooksConnected: { type: Boolean, default: false },
    quickbooksToken:     { type: String },
    stripeConnected:     { type: Boolean, default: false },
    twilioConnected:     { type: Boolean, default: false },
    docusignConnected:   { type: Boolean, default: false },
    dropboxConnected:    { type: Boolean, default: false },
    boxConnected:        { type: Boolean, default: false },
  },

  practiceAreas:       { type: [String], default: [] },
  practiceAreaConfig:  [PracticeAreaConfigSchema],
  teamMembers:         [TeamMemberSchema],
  notifications:       { type: NotificationPrefsSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('FirmSettings', FirmSettingsSchema);
