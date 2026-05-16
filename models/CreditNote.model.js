const mongoose = require('mongoose');

const STATUSES = ['issued', 'applied', 'voided'];

const CreditNoteSchema = new mongoose.Schema({
  firmId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  invoiceId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  clientId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  creditNoteNumber: { type: String, index: true },
  amount:           { type: Number, required: true, min: 0 },
  reason:           { type: String, required: true, maxlength: 1000 },
  status:           { type: String, enum: STATUSES, default: 'issued' },
  appliedToInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  stripeRefundId:   { type: String },
  issuedAt:         { type: Date, default: Date.now },
}, { timestamps: true });

CreditNoteSchema.pre('save', async function (next) {
  if (!this.creditNoteNumber) {
    const count = await mongoose.model('CreditNote').countDocuments({ firmId: this.firmId });
    this.creditNoteNumber = `CN-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

CreditNoteSchema.index({ firmId: 1, invoiceId: 1 });
CreditNoteSchema.index({ firmId: 1, clientId: 1 });

module.exports = mongoose.model('CreditNote', CreditNoteSchema);
