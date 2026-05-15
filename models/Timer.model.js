const mongoose = require('mongoose');

// One active timer per user at a time
const TimerSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  firmId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matterId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  activityType: { type: String, default: 'admin' },
  description:  { type: String, maxlength: 500 },
  startedAt:    { type: Date, required: true, default: Date.now },
  isRunning:    { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Timer', TimerSchema);
