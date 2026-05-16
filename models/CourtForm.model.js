const mongoose = require('mongoose');

const FieldPositionSchema = new mongoose.Schema({
  page: Number,
  x: Number, y: Number, w: Number, h: Number,
}, { _id: false });

const CourtFormFieldSchema = new mongoose.Schema({
  name:     String,
  label:    String,
  type:     { type: String, default: 'text' },
  position: FieldPositionSchema,
}, { _id: false });

const CourtFormSchema = new mongoose.Schema({
  jurisdiction: { type: String, required: true },
  state:        { type: String, required: true, index: true },
  court:        String,
  formName:     { type: String, required: true },
  formNumber:   String,
  category:     String,
  description:  String,
  pdfUrl:       String,
  fields:       [CourtFormFieldSchema],
  lastUpdated:  { type: Date, default: Date.now },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

CourtFormSchema.index({ state: 1, category: 1 });
CourtFormSchema.index({ formName: 'text', formNumber: 'text', description: 'text' });

module.exports = mongoose.model('CourtForm', CourtFormSchema);
