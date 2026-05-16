const mongoose = require('mongoose');
const OID = mongoose.Schema.Types.ObjectId;

const VersionSchema = new mongoose.Schema({
  versionNumber: { type: Number, required: true },
  s3Key:         { type: String },
  size:          { type: Number, default: 0 },
  uploadedBy:    { type: OID, ref: 'User' },
  uploadedAt:    { type: Date, default: Date.now },
  notes:         { type: String },
});

const PermissionsSchema = new mongoose.Schema({
  type:    { type: String, enum: ['everyone','specific_users','matter_team','admin_only'], default: 'everyone' },
  userIds: [{ type: OID, ref: 'User' }],
}, { _id: false });

const PracticeDocumentSchema = new mongoose.Schema({
  firmId:     { type: OID, ref: 'User',   required: true, index: true },
  matterId:   { type: OID, ref: 'Matter' },
  contactId:  { type: OID, ref: 'Contact' },
  folderId:   { type: OID, ref: 'DocumentFolder' },
  uploadedBy: { type: OID, ref: 'User',   required: true },

  name:         { type: String, required: true, trim: true, maxlength: 500 },
  originalName: { type: String, required: true },
  mimeType:     { type: String },
  size:         { type: Number, default: 0 },
  s3Key:        { type: String },
  s3Bucket:     { type: String, default: 'practice-docs' },
  cdnUrl:       { type: String },

  versions:       { type: [VersionSchema], default: [] },
  currentVersion: { type: Number, default: 1 },
  description:    { type: String, maxlength: 2000 },
  tags:           [String],

  permissions:     { type: PermissionsSchema, default: {} },
  isClientVisible: { type: Boolean, default: false },
  isScanned:       { type: Boolean, default: false },
  scanSource:      { type: String, enum: ['upload','mobile','esign','filing'], default: 'upload' },

  textContent:     { type: String, select: false },
  fullTextIndexed: { type: Boolean, default: false },

  externalSource: { type: String, enum: ['google_drive','dropbox','onedrive'] },
  externalId:     { type: String },

  shareToken:     { type: String, index: true, sparse: true },
  shareExpiresAt: { type: Date },

  isFiledWithCourt: { type: Boolean, default: false },
  filingStatus:     { type: String },
  fileStampUrl:     { type: String },
  isDeleted:        { type: Boolean, default: false, index: true },
}, { timestamps: true });

PracticeDocumentSchema.index({ firmId: 1, matterId: 1 });
PracticeDocumentSchema.index({ firmId: 1, folderId: 1 });
PracticeDocumentSchema.index({ firmId: 1, name: 'text', tags: 'text' });

module.exports = mongoose.model('PracticeDocument', PracticeDocumentSchema);
