const mongoose = require('mongoose');

const GeneratedDocumentSchema = new mongoose.Schema({
  firmId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  templateId:   { type: mongoose.Schema.Types.ObjectId, ref: 'DocTemplate' },
  generatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fieldValues:  mongoose.Schema.Types.Mixed,
  documentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'PracticeDocument' },
  outputFormat: { type: String, enum: ['docx', 'pdf', 'txt'], default: 'txt' },
  generatedAt:  { type: Date, default: Date.now },
  fileName:     String,
  content:      String,
}, { timestamps: true });

GeneratedDocumentSchema.index({ firmId: 1, matterId: 1 });
GeneratedDocumentSchema.index({ firmId: 1, templateId: 1 });

module.exports = mongoose.model('GeneratedDocument', GeneratedDocumentSchema);
