const mongoose = require('mongoose');

const WorkflowSchema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:   { type: String, required: true, trim: true },
  trigger: {
    event:      { type: String, enum: ['lead_created','stage_changed','form_submitted','consultation_booked'] },
    stage:      { type: String },
    conditions: [{ type: mongoose.Schema.Types.Mixed }],
  },
  steps: [{
    order: { type: Number, required: true },
    type:  { type: String, enum: ['send_email','wait','create_task','change_stage','send_form','webhook'], required: true },
    config: {
      templateId:   { type: mongoose.Schema.Types.ObjectId, ref: 'DocTemplate' },
      days:         Number,
      taskTitle:    String,
      stage:        String,
      formId:       { type: mongoose.Schema.Types.ObjectId, ref: 'IntakeForm' },
      url:          String,
      emailSubject: String,
      emailBody:    String,
    },
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Workflow', WorkflowSchema);
