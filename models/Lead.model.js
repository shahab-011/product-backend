const mongoose = require('mongoose');

const LEAD_STAGES  = ['New Lead','Contacted','Consultation Scheduled','Proposal Sent','Hired','Not Hired'];
const LEAD_SOURCES = ['Website Form','Referral','Social Media','Paid Ad','Phone Call','Walk-in','Bar Referral','Other'];
const PRACTICE_AREAS = [
  'Family Law','Criminal','Contract','Property','Immigration',
  'Employment','IP','Personal Injury','Tax','Civil','Corporate','Other',
];

const ActivitySchema = new mongoose.Schema({
  type:        { type: String },
  description: { type: String },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date:        { type: Date, default: Date.now },
}, { _id: false });

const LeadSchema = new mongoose.Schema({
  firmId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  name:        { type: String, required: true, trim: true, maxlength: 200 },
  email:       { type: String, trim: true, lowercase: true },
  phone:       { type: String, trim: true },
  address: {
    street: String, city: String, state: String, zip: String, country: String,
  },
  dateOfBirth: { type: Date },

  practiceArea:   { type: String, enum: PRACTICE_AREAS, default: 'Other' },
  source:         { type: String, enum: LEAD_SOURCES, default: 'Website Form' },
  estimatedValue: { type: Number, default: 0 },
  score:          { type: Number, min: 1, max: 5 },
  tags:           [{ type: String, trim: true }],

  stage:      { type: String, enum: LEAD_STAGES, default: 'New Lead' },
  pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline' },

  description: { type: String, maxlength: 2000 },
  notes:       { type: String, maxlength: 5000 },

  intakeFormId:  { type: mongoose.Schema.Types.ObjectId, ref: 'IntakeForm' },
  formResponses: { type: mongoose.Schema.Types.Mixed },

  conflictCheckStatus: { type: String, enum: ['not_checked', 'clear', 'conflict'], default: 'not_checked' },

  consultationDate:     { type: Date },
  consultationAttorney: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  convertedToMatterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  convertedToContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  convertedAt:  { type: Date },
  isConverted:  { type: Boolean, default: false },

  lastContactDate:  { type: Date },
  nextFollowUpDate: { type: Date },

  emailOptOut:  { type: Boolean, default: false },
  emailBounced: { type: Boolean, default: false },

  workflowState: {
    workflowId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
    currentStep: { type: Number, default: 0 },
    stateData:   { type: mongoose.Schema.Types.Mixed },
  },

  activityLog: [ActivitySchema],
  isDeleted:   { type: Boolean, default: false, index: true },
}, { timestamps: true });

LeadSchema.index({ firmId: 1, stage: 1 });

module.exports = mongoose.model('Lead', LeadSchema);
