const mongoose = require('mongoose');

const BankTransactionSchema = new mongoose.Schema({
  firmId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  bankConnectionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'BankConnection', required: true },

  plaidTransactionId: { type: String, unique: true, sparse: true },

  date:        { type: Date, required: true },
  amount:      { type: Number, required: true },   // positive = credit to bank, negative = debit
  description: { type: String, maxlength: 500 },
  merchant:    { type: String, maxlength: 200 },
  category:    [{ type: String }],

  matchedJournalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  status: { type: String, enum: ['unmatched', 'matched', 'excluded'], default: 'unmatched', index: true },

  taxCategory: { type: String, maxlength: 100 },
  notes:       { type: String, maxlength: 500 },
}, { timestamps: true });

BankTransactionSchema.index({ firmId: 1, date: -1 });
BankTransactionSchema.index({ firmId: 1, bankConnectionId: 1, status: 1 });

module.exports = mongoose.model('BankTransaction', BankTransactionSchema);
