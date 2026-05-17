const mongoose = require('mongoose');

const AISuggestionSchema = new mongoose.Schema({
  firmId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  matterId:{ type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },

  type: {
    type: String,
    enum: ['time_entry','deadline','invoice_error','task','document_draft','conflict_analysis'],
    required: true,
  },
  title:        { type: String, required: true, maxlength: 300 },
  description:  { type: String, maxlength: 2000 },
  suggestedData:{ type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

  status:      { type: String, enum: ['pending','accepted','dismissed'], default: 'pending', index: true },
  acceptedAt:  { type: Date },
  dismissedAt: { type: Date },
}, { timestamps: true });

AISuggestionSchema.index({ firmId: 1, userId: 1, status: 1 });

module.exports = mongoose.model('AISuggestion', AISuggestionSchema);
