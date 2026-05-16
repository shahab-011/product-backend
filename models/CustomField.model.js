const mongoose = require('mongoose');

const CustomFieldSchema = new mongoose.Schema({
  firmId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:          { type: String, required: true, trim: true, maxlength: 100 },
  slug:          { type: String, required: true, trim: true, maxlength: 100 },
  type:          { type: String, enum: ['text','number','date','boolean','select','multiselect'], default: 'text' },
  options:       [String],
  isRequired:    { type: Boolean, default: false },
  practiceAreas: [String],
  order:         { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

CustomFieldSchema.index({ firmId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('CustomField', CustomFieldSchema);
