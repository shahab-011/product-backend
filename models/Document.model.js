const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true },
    storedName: { type: String },
    fileType: {
      type: String,
      enum: ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp', 'other'],
      required: true,
    },
    docType: {
      type: String,
      enum: [
        'Contract',
        'NDA',
        'MoU',
        'Rent Agreement',
        'Offer Letter',
        'Will',
        'Property Deed',
        'Partnership Deed',
        'Freelance Agreement',
        'Vendor Agreement',
        'Service Agreement',
        'Consultancy Agreement',
        'Other',
      ],
      default: 'Other',
    },
    fileSizeBytes: { type: Number },
    pageCount: { type: Number, default: 1 },
    extractedText: { type: String },
    jurisdiction: { type: String, default: 'Not detected' },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'analyzed', 'error'],
      default: 'uploaded',
    },
    isPrivate: { type: Boolean, default: true },
    healthScore: { type: Number, min: 0, max: 100, default: 0 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    riskCount: { type: Number, default: 0 },
    expiryDate: { type: Date },
    renewalDate: { type: Date },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DocumentSchema.index({ userId: 1, uploadedAt: -1 });
DocumentSchema.index({ status: 1 });
DocumentSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('Document', DocumentSchema);
