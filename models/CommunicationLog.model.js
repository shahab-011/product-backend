const mongoose = require('mongoose');

const COMM_TYPES       = ['Call','Email','Meeting','Note'];
const COMM_DIRECTIONS  = ['Inbound','Outbound'];

const CommunicationLogSchema = new mongoose.Schema({
  firmId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  type:      { type: String, enum: COMM_TYPES, required: true },
  direction: { type: String, enum: COMM_DIRECTIONS, default: 'Outbound' },
  contact:   { type: String, required: true, maxlength: 200 },
  date:      { type: Date, default: Date.now },
  time:      { type: String },
  duration:  { type: String },
  summary:   { type: String, required: true, maxlength: 5000 },
  attorney:  { type: String, maxlength: 100 },
}, { timestamps: true });

CommunicationLogSchema.index({ firmId: 1, date: -1 });
CommunicationLogSchema.index({ firmId: 1, matterId: 1 });

module.exports = mongoose.model('CommunicationLog', CommunicationLogSchema);
