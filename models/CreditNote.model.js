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

CreditNoteSchema.pre('save', async function () {
  if (!this.creditNoteNumber) {
    const latest = await mongoose.model('CreditNote')
      .findOne({ firmId: this.firmId, creditNoteNumber: { $exists: true } })
      .sort({ creditNoteNumber: -1 })
      .select('creditNoteNumber')
      .lean();
    const seq = latest?.creditNoteNumber
      ? (parseInt(latest.creditNoteNumber.replace(/\D/g, ''), 10) || 0) + 1
      : 1;
    this.creditNoteNumber = `CN-${String(seq).padStart(4, '0')}`;
  }
});

CreditNoteSchema.index({ firmId: 1, invoiceId: 1 });
CreditNoteSchema.index({ firmId: 1, clientId: 1 });

module.exports = mongoose.model('CreditNote', CreditNoteSchema);
