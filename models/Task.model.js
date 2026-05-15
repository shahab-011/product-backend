const mongoose = require('mongoose');

const TASK_STATUSES    = ['todo','in_progress','review','done'];
const TASK_PRIORITIES  = ['high','medium','low'];
const ACTIVITY_TYPES   = ['research','drafting','review','court','meeting','calls','admin','other'];

const TaskSchema = new mongoose.Schema({
  firmId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  title:        { type: String, required: true, trim: true, maxlength: 500 },
  description:  { type: String, maxlength: 2000 },
  status:       { type: String, enum: TASK_STATUSES, default: 'todo' },
  priority:     { type: String, enum: TASK_PRIORITIES, default: 'medium' },
  activityType: { type: String, enum: ACTIVITY_TYPES, default: 'admin' },

  dueDate:       { type: Date },
  estimatedHours:{ type: Number, default: 0 },
  completedAt:   { type: Date },
  order:         { type: Number, default: 0 },  // Kanban sort order within column
}, { timestamps: true });

// Auto-set completedAt when status → done
TaskSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'done' && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (this.isModified('status') && this.status !== 'done') {
    this.completedAt = undefined;
  }
  next();
});

TaskSchema.index({ firmId: 1, status: 1 });
TaskSchema.index({ firmId: 1, matterId: 1 });
TaskSchema.index({ firmId: 1, dueDate: 1 });

module.exports = mongoose.model('Task', TaskSchema);
