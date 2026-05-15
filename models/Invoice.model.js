const mongoose = require('mongoose');

const INVOICE_STATUSES = ['draft','sent','paid','overdue','void'];

const LineItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity:    { type: Number, required: true, min: 0 },
  rate:        { type: Number, required: true, min: 0 },
  amount:      { type: Number },   // auto = quantity * rate
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  firmId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Matter' },
  clientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  clientName:   { type: String },

  invoiceNumber:{ type: String, unique: true },
  status:       { type: String, enum: INVOICE_STATUSES, default: 'draft' },

  issueDate:    { type: Date, default: Date.now },
  dueDate:      { type: Date },

  lineItems:    [LineItemSchema],
  subtotal:     { type: Number, default: 0 },
  taxRate:      { type: Number, default: 0, min: 0, max: 100 },
  taxAmount:    { type: Number, default: 0 },
  discount:     { type: Number, default: 0 },
  total:        { type: Number, default: 0 },

  notes:         { type: String, maxlength: 2000 },
  paymentDate:   { type: Date },
  paymentMethod: { type: String },
  paymentNotes:  { type: String },
  sentAt:        { type: Date },
  paymentLink:   { type: String },  // URL for online payment
}, { timestamps: true });

// Auto-generate invoice number + compute totals
InvoiceSchema.pre('save', async function (next) {
  // Number
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Invoice').countDocuments({ firmId: this.firmId });
    this.invoiceNumber = `INV-${String(count + 1).padStart(3, '0')}`;
  }

  // Totals
  this.lineItems.forEach(li => { li.amount = +(li.quantity * li.rate).toFixed(2); });
  this.subtotal  = +this.lineItems.reduce((s, li) => s + (li.amount || 0), 0).toFixed(2);
  this.taxAmount = +((this.subtotal * this.taxRate) / 100).toFixed(2);
  this.total     = +(this.subtotal + this.taxAmount - (this.discount || 0)).toFixed(2);

  next();
});

InvoiceSchema.index({ firmId: 1, status: 1 });
InvoiceSchema.index({ firmId: 1, matterId: 1 });
InvoiceSchema.index({ firmId: 1, dueDate: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
