const mongoose = require('mongoose');

const AIActionSchema = new mongoose.Schema({
  firmId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  action:     { type: String, required: true },
  input:      { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  output:     { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  model:      { type: String },
  tokensUsed: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  status:     { type: String, enum: ['success','error'], default: 'success' },
  error:      { type: String },
}, { timestamps: true });

AIActionSchema.index({ firmId: 1, createdAt: -1 });

module.exports = mongoose.model('AIAction', AIActionSchema);
