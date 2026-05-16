const mongoose = require('mongoose');

const CATEGORIES = [
  'filing_fee','court_reporter','expert_witness',
  'travel','copies','postage','meals','other',
];
const APPROVAL_STATUSES = ['pending','approved','rejected'];

const ExpenseSchema = new mongoose.Schema({
  firmId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  date:        { type: Date, default: Date.now },
  category:    { type: String, enum: CATEGORIES, default: 'other' },
  description: { type: String, required: true, maxlength: 1000 },
  amount:      { type: Number, required: true, min: 0 },

  isBillable: { type: Boolean, default: true },
  isBilled:   { type: Boolean, default: false },
  invoiceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

  receiptUrl: { type: String },
  receiptKey: { type: String },

  taxRate:   { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },

  approvalStatus: { type: String, enum: APPROVAL_STATUSES, default: 'approved' },
  approvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:     { type: Date },

  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

ExpenseSchema.pre('save', function (next) {
  this.taxAmount = +(this.amount * (this.taxRate || 0) / 100).toFixed(2);
  next();
});

ExpenseSchema.index({ firmId: 1, matterId: 1 });
ExpenseSchema.index({ firmId: 1, userId: 1 });
ExpenseSchema.index({ firmId: 1, date: -1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
