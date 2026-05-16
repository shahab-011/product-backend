const mongoose = require('mongoose');

const SlotSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end:   { type: String, required: true },
}, { _id: false });

const ScheduleSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  slots:     [SlotSchema],
}, { _id: false });

const BlockoutSchema = new mongoose.Schema({
  date:   { type: Date, required: true },
  reason: { type: String },
}, { _id: false });

const AvailabilitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  weeklySchedule:       { type: [ScheduleSchema], default: [] },
  blockouts:            { type: [BlockoutSchema],  default: [] },
  bookingPageSlug:      { type: String, unique: true, sparse: true },
  bufferMinutes:        { type: Number, default: 15 },
  consultationDuration: { type: Number, default: 60 },
  consultationFee:      { type: Number, default: 0 },
  isPublic:             { type: Boolean, default: false },
  customQuestions:      [String],
}, { timestamps: true });

module.exports = mongoose.model('Availability', AvailabilitySchema);
