const mongoose = require('mongoose');

const AnnotationSchema = new mongoose.Schema(
  {
    documentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
    userName:    { type: String, required: true, trim: true },
    clauseIndex: { type: Number, required: true, min: 0 },
    text:        { type: String, required: true, trim: true, maxlength: 1000 },
    color:       { type: String, enum: ['yellow', 'blue', 'green', 'red'], default: 'yellow' },
  },
  { timestamps: true }
);

AnnotationSchema.index({ documentId: 1, clauseIndex: 1 });

module.exports = mongoose.model('Annotation', AnnotationSchema);
