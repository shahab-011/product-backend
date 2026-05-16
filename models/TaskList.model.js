const mongoose = require('mongoose');
const OID = mongoose.Schema.Types.ObjectId;

const TaskListSchema = new mongoose.Schema({
  firmId:       { type: OID, ref: 'User',   required: true, index: true },
  matterId:     { type: OID, ref: 'Matter' },
  name:         { type: String, required: true, trim: true, maxlength: 200 },
  description:  { type: String, maxlength: 1000 },
  order:        { type: Number, default: 0 },
  isTemplate:   { type: Boolean, default: false, index: true },
  templateName: { type: String },
  isDeleted:    { type: Boolean, default: false, index: true },
}, { timestamps: true });

TaskListSchema.index({ firmId: 1, matterId: 1 });

module.exports = mongoose.model('TaskList', TaskListSchema);
