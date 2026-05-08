const mongoose = require('mongoose');

const CollaborationSessionSchema = new mongoose.Schema(
  {
    documentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName:      { type: String, required: true },
    userRole:      { type: String, required: true },
    socketId:      { type: String, required: true },
    isOnline:      { type: Boolean, default: true },
    lastSeen:      { type: Date, default: Date.now },
    currentClause: { type: Number, default: null },
  },
  { timestamps: true }
);

CollaborationSessionSchema.index({ documentId: 1, userId: 1 }, { unique: true });
CollaborationSessionSchema.index({ socketId: 1 });

module.exports = mongoose.model('CollaborationSession', CollaborationSessionSchema);
