const mongoose = require('mongoose');

const EVENT_TYPES = [
  'court_date','hearing','deposition','client_meeting',
  'filing_deadline','conference_call','appointment','reminder','sol','other',
];
const EVENT_STATUSES = ['scheduled','completed','cancelled','rescheduled'];

const AttendeeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email:  { type: String },
  status: { type: String, enum: ['accepted','declined','pending'], default: 'pending' },
}, { _id: false });

const ReminderSchema = new mongoose.Schema({
  method:        { type: String, enum: ['email','sms','push'], default: 'email' },
  minutesBefore: { type: Number, default: 60 },
}, { _id: false });

const RecurrenceSchema = new mongoose.Schema({
  frequency:  { type: String, enum: ['daily','weekly','monthly','yearly'] },
  interval:   { type: Number, default: 1 },
  until:      Date,
  daysOfWeek: [Number],
}, { _id: false });

const LocationSchema = new mongoose.Schema({
  type:       { type: String, enum: ['in_person','virtual'], default: 'in_person' },
  address:    String,
  virtualUrl: String,
}, { _id: false });

const CalendarEventSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  title:       { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, maxlength: 2000 },
  eventType:   { type: String, enum: EVENT_TYPES, default: 'other' },

  startDate: { type: Date, required: true },
  endDate:   { type: Date },
  allDay:    { type: Boolean, default: false },

  location:   LocationSchema,
  attendees:  [AttendeeSchema],
  reminders:  { type: [ReminderSchema], default: [{ method: 'email', minutesBefore: 60 }] },
  recurrence: RecurrenceSchema,

  color:       { type: String, default: '#7C3AED' },
  isPrivate:   { type: Boolean, default: false },
  isCourtDate: { type: Boolean, default: false },
  isSol:       { type: Boolean, default: false },
  sourceRule:  { type: String },
  status:      { type: String, enum: EVENT_STATUSES, default: 'scheduled' },
  isDeleted:   { type: Boolean, default: false, index: true },
}, { timestamps: true });

CalendarEventSchema.index({ firmId: 1, startDate: 1 });
CalendarEventSchema.index({ firmId: 1, matterId: 1 });

module.exports = mongoose.model('CalendarEvent', CalendarEventSchema);
