const mongoose = require('mongoose');

const ACTIVITY_TYPES = [
  'research','drafting','court','client_meeting','calls',
  'review','travel','admin','other',
];

const TimeEntrySchema = new mongoose.Schema({
  firmId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  date:         { type: Date, default: Date.now },
  activityType: { type: String, enum: ACTIVITY_TYPES, default: 'admin' },
  description:  { type: String, maxlength: 2000 },

  hours:  { type: Number, required: true, min: 0 },
  rate:   { type: Number, required: true, min: 0, default: 0 },
  amount: { type: Number },

  isBillable: { type: Boolean, default: true },
  isBilled:   { type: Boolean, default: false },
  invoiceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

  linkedEventId:         { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent' },
  linkedTaskId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  linkedCommunicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunicationLog' },

  taxRate:   { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },

  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

TimeEntrySchema.pre('save', function (next) {
  this.amount    = +(this.hours * this.rate).toFixed(2);
  this.taxAmount = +(this.amount * (this.taxRate || 0) / 100).toFixed(2);
  next();
});

TimeEntrySchema.index({ firmId: 1, matterId: 1 });
TimeEntrySchema.index({ firmId: 1, userId: 1 });
TimeEntrySchema.index({ firmId: 1, date: -1 });
TimeEntrySchema.index({ firmId: 1, isBilled: 1, isBillable: 1 });

module.exports = mongoose.model('TimeEntry', TimeEntrySchema);
