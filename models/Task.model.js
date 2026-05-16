const mongoose = require('mongoose');

const STATUSES       = ['to_do','in_progress','in_review','blocked','completed'];
const PRIORITIES     = ['urgent','high','medium','low'];
const ACTIVITY_TYPES = ['research','drafting','review','court','client_meeting','calls','admin','other'];
const OID = mongoose.Schema.Types.ObjectId;

const SubtaskSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
  completedAt: Date,
});

const DependencySchema = new mongoose.Schema({
  taskId: { type: OID, ref: 'Task', required: true },
  type:   { type: String, enum: ['blocked_by','blocks'], required: true },
}, { _id: false });

const AttachmentSchema = new mongoose.Schema({
  name: String,
  url:  String,
  key:  String,
}, { _id: false });

const RecurrenceSchema = new mongoose.Schema({
  frequency: { type: String, enum: ['daily','weekly','monthly','yearly'] },
  interval:  { type: Number, default: 1 },
  until:     Date,
}, { _id: false });

const TaskSchema = new mongoose.Schema({
  firmId:      { type: OID, ref: 'User',     required: true, index: true },
  matterId:    { type: OID, ref: 'Matter' },
  taskListId:  { type: OID, ref: 'TaskList' },
  createdBy:   { type: OID, ref: 'User',     required: true },
  assignedTo:  [{ type: OID, ref: 'User' }],
  completedBy: { type: OID, ref: 'User' },

  title:          { type: String, required: true, trim: true, maxlength: 500 },
  description:    { type: String, maxlength: 5000 },
  priority:       { type: String, enum: PRIORITIES,     default: 'medium' },
  status:         { type: String, enum: STATUSES,       default: 'to_do' },
  activityType:   { type: String, enum: ACTIVITY_TYPES, default: 'admin' },

  dueDate:        Date,
  dueTime:        String,
  reminderAt:     Date,
  estimatedHours: { type: Number, default: 0 },
  completedAt:    Date,

  subtasks:     { type: [SubtaskSchema],    default: [] },
  dependencies: { type: [DependencySchema], default: [] },
  tags:         [String],
  attachments:  { type: [AttachmentSchema], default: [] },
  recurrence:   RecurrenceSchema,
  order:        { type: Number, default: 0 },
  isDeleted:    { type: Boolean, default: false, index: true },
}, { timestamps: true });

TaskSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (this.isModified('status') && this.status !== 'completed') {
    this.completedAt = undefined;
    this.completedBy = undefined;
  }
  next();
});

TaskSchema.index({ firmId: 1, status: 1 });
TaskSchema.index({ firmId: 1, matterId: 1 });
TaskSchema.index({ firmId: 1, dueDate: 1 });
TaskSchema.index({ firmId: 1, assignedTo: 1 });

module.exports = mongoose.model('Task', TaskSchema);
