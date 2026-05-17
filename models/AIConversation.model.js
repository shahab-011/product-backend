const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user','assistant'], required: true },
  content:   { type: String, required: true },
  citations: [{ type: String }],
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const AIConversationSchema = new mongoose.Schema({
  firmId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  matterId:{ type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },

  messages:    { type: [MessageSchema], default: [] },
  contextHash: { type: String },
}, { timestamps: true });

AIConversationSchema.index({ firmId: 1, matterId: 1, userId: 1 });

module.exports = mongoose.model('AIConversation', AIConversationSchema);
