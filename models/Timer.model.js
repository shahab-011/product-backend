const mongoose = require('mongoose');

const TimerSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  firmId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matterId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  activityType:  { type: String, default: 'admin' },
  description:   { type: String, maxlength: 500 },
  startedAt:     { type: Date, required: true, default: Date.now },
  pausedDuration:{ type: Number, default: 0 },   // ms already paused
  isPaused:      { type: Boolean, default: false },
  pausedAt:      { type: Date },
  isRunning:     { type: Boolean, default: true },
  lastSyncAt:    { type: Date, default: Date.now },
}, { timestamps: true });

// Allow up to 5 concurrent timers per user, but only one per matter
TimerSchema.index({ userId: 1, matterId: 1 }, { unique: true, sparse: true });
TimerSchema.index({ userId: 1, isRunning: 1 });

module.exports = mongoose.model('Timer', TimerSchema);
