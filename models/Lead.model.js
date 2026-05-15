const mongoose = require('mongoose');

const LEAD_STAGES  = ['New Lead','Contacted','Consultation','Proposal Sent','Won','Lost'];
const LEAD_SOURCES = ['Website','Referral','LinkedIn','Advertisement','Walk-in','Phone','Other'];
const PRACTICE_AREAS = [
  'Family Law','Criminal','Contract','Property','Immigration',
  'Employment','IP','Personal Injury','Tax','Civil','Corporate','Other',
];

const LeadSchema = new mongoose.Schema({
  firmId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  name:         { type: String, required: true, trim: true, maxlength: 200 },
  email:        { type: String, trim: true, lowercase: true },
  phone:        { type: String, trim: true },
  practiceArea: { type: String, enum: PRACTICE_AREAS, default: 'Other' },
  source:       { type: String, enum: LEAD_SOURCES, default: 'Website' },
  description:  { type: String, maxlength: 2000 },
  estimatedValue:{ type: Number, default: 0 },

  stage:           { type: String, enum: LEAD_STAGES, default: 'New Lead' },
  notes:           { type: String, maxlength: 3000 },
  lastContactDate: { type: Date },

  convertedToMatterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  convertedAt:         { type: Date },
}, { timestamps: true });

LeadSchema.index({ firmId: 1, stage: 1 });

module.exports = mongoose.model('Lead', LeadSchema);
