const mongoose = require('mongoose');

const EVENT_TYPES = [
  'court_date','hearing','deposition','client_meeting',
  'deadline','conference','call','reminder','other',
];
const EVENT_STATUSES = ['scheduled','completed','cancelled'];

const CalendarEventSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  title:       { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, maxlength: 2000 },
  eventType:   { type: String, enum: EVENT_TYPES, default: 'other' },

  startDate: { type: Date, required: true },
  endDate:   { type: Date },
  allDay:    { type: Boolean, default: false },

  location:        { type: String, maxlength: 500 },
  color:           { type: String, default: '#7C3AED' },
  reminderMinutes: { type: Number, default: 60 },  // 0 = no reminder
  status:          { type: String, enum: EVENT_STATUSES, default: 'scheduled' },
}, { timestamps: true });

CalendarEventSchema.index({ firmId: 1, startDate: 1 });
CalendarEventSchema.index({ firmId: 1, matterId: 1 });

module.exports = mongoose.model('CalendarEvent', CalendarEventSchema);
