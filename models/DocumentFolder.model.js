const mongoose = require('mongoose');
const OID = mongoose.Schema.Types.ObjectId;

const DEFAULT_FOLDERS = ['Pleadings','Correspondence','Evidence','Contracts','Forms','Discovery','Other'];

const DocumentFolderSchema = new mongoose.Schema({
  firmId:    { type: OID, ref: 'User',   required: true, index: true },
  matterId:  { type: OID, ref: 'Matter' },
  parentId:  { type: OID, ref: 'DocumentFolder' },
  name:      { type: String, required: true, trim: true, maxlength: 200 },
  order:     { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: OID, ref: 'User' },
}, { timestamps: true });

DocumentFolderSchema.index({ firmId: 1, matterId: 1 });

DocumentFolderSchema.statics.DEFAULT_FOLDERS = DEFAULT_FOLDERS;

module.exports = mongoose.model('DocumentFolder', DocumentFolderSchema);
