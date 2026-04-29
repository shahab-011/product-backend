const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const ChatSessionSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    messages: { type: [MessageSchema], default: [] },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

ChatSessionSchema.index({ documentId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ChatSession', ChatSessionSchema);
