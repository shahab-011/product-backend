const mongoose = require('mongoose');

const DeadlineSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  daysOffset:    { type: Number, required: true },
  description:   { type: String },
  isWeekdayOnly: { type: Boolean, default: true },
}, { _id: false });

const CourtRuleSchema = new mongoose.Schema({
  jurisdiction: { type: String },
  state:        { type: String, required: true, index: true },
  courtName:    { type: String, required: true },
  caseType:     { type: String, required: true },
  triggerEvent: { type: String, required: true },
  deadlines:    [DeadlineSchema],
  isActive:     { type: Boolean, default: true, index: true },
  lastUpdated:  { type: Date, default: Date.now },
}, { timestamps: true });

CourtRuleSchema.index({ state: 1, caseType: 1 });

module.exports = mongoose.model('CourtRule', CourtRuleSchema);
