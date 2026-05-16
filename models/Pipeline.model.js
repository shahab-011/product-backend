const mongoose = require('mongoose');

const PipelineSchema = new mongoose.Schema({
  firmId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:         { type: String, required: true, trim: true },
  practiceArea: { type: String },
  stages: [{
    name:   { type: String, required: true },
    color:  { type: String, default: '#6B7280' },
    order:  { type: Number, default: 0 },
    isWon:  { type: Boolean, default: false },
    isLost: { type: Boolean, default: false },
  }],
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Pipeline', PipelineSchema);
