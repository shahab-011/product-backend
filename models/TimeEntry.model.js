const mongoose = require('mongoose');

const TIME_ACTIVITY_TYPES = [
  'research','drafting','court','client_meeting','calls',
  'review','travel','admin','other',
];

const TimeEntrySchema = new mongoose.Schema({
  firmId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Matter', required: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  date:         { type: Date, default: Date.now },
  activityType: { type: String, enum: TIME_ACTIVITY_TYPES, default: 'admin' },
  description:  { type: String, maxlength: 1000 },

  hours:  { type: Number, required: true, min: 0 },   // e.g. 1.5
  rate:   { type: Number, required: true, min: 0 },   // PKR/hr at time of entry
  amount: { type: Number },                           // auto = hours * rate

  isBillable: { type: Boolean, default: true },
  isBilled:   { type: Boolean, default: false },
  invoiceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
}, { timestamps: true });

TimeEntrySchema.pre('save', function (next) {
  this.amount = +(this.hours * this.rate).toFixed(2);
  next();
});

TimeEntrySchema.index({ firmId: 1, matterId: 1 });
TimeEntrySchema.index({ firmId: 1, userId: 1 });
TimeEntrySchema.index({ firmId: 1, date: -1 });

module.exports = mongoose.model('TimeEntry', TimeEntrySchema);
