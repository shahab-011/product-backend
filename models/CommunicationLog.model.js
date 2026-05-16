const mongoose = require('mongoose');

const COMM_TYPES = [
  'Email Sent', 'Email Received',
  'Phone Call (Outbound)', 'Phone Call (Inbound)',
  'Video Call', 'Meeting (In-Person)', 'Court Appearance',
  'Text Message', 'Letter Sent', 'Letter Received', 'Note',
];
const DIRECTIONS = ['Inbound', 'Outbound'];
const SOURCES    = ['manual', 'gmail', 'outlook', 'twilio'];

const CommunicationLogSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  type:      { type: String, enum: COMM_TYPES, required: true },
  direction: { type: String, enum: DIRECTIONS, default: 'Outbound' },
  subject:   { type: String, maxlength: 500 },
  body:      { type: String },
  summary:   { type: String, maxlength: 5000 },
  contact:   { type: String, maxlength: 200 },
  outcome:   { type: String, maxlength: 1000 },

  date:     { type: Date, default: Date.now },
  time:     { type: String },
  duration: { type: Number },

  attachments: [{
    name:       String,
    url:        String,
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  }],

  isBillable:  { type: Boolean, default: false },
  timeEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'TimeEntry' },

  followUpRequired:  { type: Boolean, default: false },
  followUpDueDate:   { type: Date },
  followUpCompleted: { type: Boolean, default: false },

  externalId: { type: String },
  source:     { type: String, enum: SOURCES, default: 'manual' },
  isDeleted:  { type: Boolean, default: false, index: true },
}, { timestamps: true });

CommunicationLogSchema.index({ firmId: 1, date: -1 });
CommunicationLogSchema.index({ firmId: 1, matterId: 1 });
CommunicationLogSchema.index({ firmId: 1, contactId: 1 });
CommunicationLogSchema.index({ externalId: 1 }, { sparse: true });

module.exports = mongoose.model('CommunicationLog', CommunicationLogSchema);
