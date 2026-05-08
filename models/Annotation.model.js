const mongoose = require('mongoose');

const AnnotationSchema = new mongoose.Schema(
  {
    documentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName:    { type: String, required: true, trim: true },
    authorRole:  { type: String, default: 'user' },
    clauseIndex: { type: Number, required: true, min: 0 },
    clauseName:  { type: String, default: '' },
    text:        { type: String, required: true, trim: true, maxlength: 2000 },
    color:       { type: String, enum: ['yellow', 'blue', 'green', 'red'], default: 'yellow' },
    type:        { type: String, enum: ['annotation', 'risk_flag', 'question', 'approval', 'reply'], default: 'annotation' },
    severity:    { type: String, enum: ['low', 'medium', 'high', 'critical', null], default: null },
    isResolved:  { type: Boolean, default: false },
    resolvedAt:  { type: Date, default: null },
    resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    parentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Annotation', default: null },
  },
  { timestamps: true }
);

AnnotationSchema.index({ documentId: 1, clauseIndex: 1 });
AnnotationSchema.index({ documentId: 1, createdAt: 1 });
AnnotationSchema.index({ userId: 1 });

module.exports = mongoose.model('Annotation', AnnotationSchema);
