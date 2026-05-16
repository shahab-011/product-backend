const mongoose = require('mongoose');

const STATUSES        = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'];
const DISCOUNT_TYPES  = ['percent', 'fixed'];
const LINE_ITEM_TYPES = ['time_entry', 'expense', 'manual', 'flat_fee'];
const TEMPLATES       = ['standard', 'ledes'];
const PAYMENT_METHODS = ['credit_card', 'ach', 'check', 'wire', 'cash', 'other'];

const LineItemSchema = new mongoose.Schema({
  type:           { type: String, enum: LINE_ITEM_TYPES, default: 'manual' },
  sourceId:       { type: mongoose.Schema.Types.ObjectId },
  description:    { type: String, required: true },
  date:           { type: Date },
  timekeeperName: { type: String },
  quantity:       { type: Number, default: 1, min: 0 },
  rate:           { type: Number, default: 0, min: 0 },
  amount:         { type: Number, required: true },
  isTaxable:      { type: Boolean, default: false },
}, { _id: true });

const TaxLineSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  rate:   { type: Number, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const PaymentSchema = new mongoose.Schema({
  amount:        { type: Number, required: true },
  date:          { type: Date, default: Date.now },
  method:        { type: String, enum: PAYMENT_METHODS, default: 'other' },
  transactionId: { type: String },
  notes:         { type: String },
}, { _id: true });

const InstallmentSchema = new mongoose.Schema({
  dueDate: { type: Date, required: true },
  amount:  { type: Number, required: true },
  status:  { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
  paidAt:  { type: Date },
}, { _id: true });

const ReminderSchema = new mongoose.Schema({
  type:   { type: String },
  sentAt: { type: Date, default: Date.now },
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  firmId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  invoiceNumber:{ type: String, index: true },
  matterId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  clientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  clientName:   { type: String },
  clientEmail:  { type: String },
  clientAddress: {
    street: String, city: String, state: String, country: String, postalCode: String,
  },

  status:    { type: String, enum: STATUSES, default: 'draft', index: true },
  issueDate: { type: Date, default: Date.now },
  dueDate:   { type: Date },
  sentAt:    { type: Date },
  paidAt:    { type: Date },
  voidedAt:  { type: Date },
  voidReason:{ type: String },

  lineItems: [LineItemSchema],

  subtotal:       { type: Number, default: 0 },
  discountType:   { type: String, enum: DISCOUNT_TYPES },
  discountValue:  { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxLines:       [TaxLineSchema],
  totalTax:       { type: Number, default: 0 },
  total:          { type: Number, default: 0 },

  trustApplied:    { type: Number, default: 0 },
  previousBalance: { type: Number, default: 0 },
  amountDue:       { type: Number, default: 0 },

  payments:          [PaymentSchema],
  amountPaid:        { type: Number, default: 0 },
  amountOutstanding: { type: Number, default: 0 },

  lateFeePercent: { type: Number, default: 0 },
  lateFeeApplied: { type: Number, default: 0 },

  notes:         { type: String, maxlength: 3000 },
  internalNotes: { type: String, maxlength: 3000 },
  terms:         { type: String, maxlength: 2000 },
  template:      { type: String, enum: TEMPLATES, default: 'standard' },
  paymentLink:   { type: String },
  paymentToken:  { type: String, index: true, sparse: true },

  stripePaymentIntentId: { type: String },
  stripeCustomerId:      { type: String },

  paymentPlan: {
    installments: [InstallmentSchema],
  },

  remindersSent:  [ReminderSchema],
  nextReminderAt: { type: Date },

  isWrittenOff:   { type: Boolean, default: false },
  writeOffAmount: { type: Number, default: 0 },
  writeOffReason: { type: String },
  writeOffAt:     { type: Date },

  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

InvoiceSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Invoice').countDocuments({ firmId: this.firmId });
    this.invoiceNumber = `INV-${String(count + 1).padStart(4, '0')}`;
  }

  this.subtotal = +this.lineItems.reduce((s, li) => s + (li.amount || 0), 0).toFixed(2);

  if (this.discountType === 'percent') {
    this.discountAmount = +(this.subtotal * (this.discountValue || 0) / 100).toFixed(2);
  } else if (this.discountType === 'fixed') {
    this.discountAmount = +(Math.min(this.discountValue || 0, this.subtotal)).toFixed(2);
  } else {
    this.discountAmount = 0;
  }

  const taxableBase = +this.lineItems.filter(li => li.isTaxable).reduce((s, li) => s + (li.amount || 0), 0).toFixed(2);
  this.taxLines = (this.taxLines || []).map(tl => ({
    ...tl,
    amount: +(taxableBase * tl.rate / 100).toFixed(2),
  }));
  this.totalTax = +(this.taxLines.reduce((s, tl) => s + (tl.amount || 0), 0)).toFixed(2);

  this.total           = +(this.subtotal - this.discountAmount + this.totalTax + (this.lateFeeApplied || 0)).toFixed(2);
  this.amountPaid      = +(this.payments || []).reduce((s, p) => s + (p.amount || 0), 0).toFixed(2);
  this.amountDue       = +(this.total + (this.previousBalance || 0) - (this.trustApplied || 0)).toFixed(2);
  this.amountOutstanding = +(this.amountDue - this.amountPaid).toFixed(2);

  next();
});

InvoiceSchema.index({ firmId: 1, status: 1 });
InvoiceSchema.index({ firmId: 1, matterId: 1 });
InvoiceSchema.index({ firmId: 1, clientId: 1 });
InvoiceSchema.index({ firmId: 1, dueDate: 1, status: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
