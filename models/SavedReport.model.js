const mongoose = require('mongoose');

const SavedReportSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  name:        { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 500 },
  reportType:  { type: String, required: true, enum: [
    'revenue','ar_aging','collections','trust','time','utilization','wip',
    'matters','pipeline','lead_sources','custom',
  ]},

  config: {
    fields:    [{ type: String }],
    filters:   { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    groupBy:   { type: String },
    sortBy:    { type: String },
    chartType: { type: String, enum: ['bar','line','pie','table'], default: 'table' },
  },

  schedule: {
    frequency:  { type: String, enum: ['none','daily','weekly','monthly'], default: 'none' },
    dayOfWeek:  { type: Number, min: 0, max: 6 },
    dayOfMonth: { type: Number, min: 1, max: 31 },
    hour:       { type: Number, min: 0, max: 23, default: 8 },
    recipients: [{ type: String }],
  },

  lastRunAt:     { type: Date },
  lastRunResult: { type: Map, of: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model('SavedReport', SavedReportSchema);
