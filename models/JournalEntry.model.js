const mongoose = require('mongoose');

const LineSchema = new mongoose.Schema({
  accountId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  debit:       { type: Number, default: 0, min: 0 },
  credit:      { type: Number, default: 0, min: 0 },
  description: { type: String, maxlength: 500 },
}, { _id: false });

const JournalEntrySchema = new mongoose.Schema({
  firmId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date:        { type: Date, required: true, default: Date.now },
  description: { type: String, required: true, maxlength: 500 },
  reference:   { type: String, maxlength: 100 },

  source:   { type: String, enum: ['manual', 'invoice', 'trust', 'bank', 'payroll'], default: 'manual' },
  sourceId: { type: mongoose.Schema.Types.ObjectId },

  lines:    { type: [LineSchema], required: true },

  isPosted:  { type: Boolean, default: false, index: true },
  postedAt:  { type: Date },
  isVoided:  { type: Boolean, default: false },
  voidedAt:  { type: Date },
  voidReason:{ type: String },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notes:     { type: String, maxlength: 1000 },
}, { timestamps: true });

JournalEntrySchema.index({ firmId: 1, date: -1 });
JournalEntrySchema.index({ firmId: 1, source: 1, sourceId: 1 });

module.exports = mongoose.model('JournalEntry', JournalEntrySchema);
