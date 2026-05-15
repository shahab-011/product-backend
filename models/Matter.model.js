const mongoose = require('mongoose');

const PRACTICE_AREAS = [
  'Family Law','Criminal','Contract','Property','Immigration',
  'Employment','IP','Personal Injury','Tax','Civil','Corporate','Other',
];
const STAGES   = ['Intake','Open','In Discovery','Pre-Trial','Trial','Settlement','Closed','Archived'];
const STATUSES = ['active','pending','on_hold','closed','archived'];
const BILLING  = ['hourly','flat_fee','contingency','retainer','pro_bono'];

const NoteSchema = new mongoose.Schema({
  text:      { type: String, required: true, maxlength: 5000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

const MatterSchema = new mongoose.Schema({
  firmId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  clientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },

  matterNumber:  { type: String, unique: true },
  title:         { type: String, required: true, trim: true, maxlength: 300 },
  practiceArea:  { type: String, enum: PRACTICE_AREAS, default: 'Other' },
  stage:         { type: String, enum: STAGES, default: 'Intake' },
  status:        { type: String, enum: STATUSES, default: 'active' },
  description:   { type: String, maxlength: 3000 },

  openDate:  { type: Date, default: Date.now },
  closeDate: { type: Date },

  billingType:        { type: String, enum: BILLING, default: 'hourly' },
  hourlyRate:         { type: Number, default: 0 },
  retainerAmount:     { type: Number, default: 0 },
  contingencyPercent: { type: Number, default: 0 },
  estimatedValue:     { type: Number, default: 0 },

  courtName:       { type: String },
  courtCaseNumber: { type: String },
  opposingParty:   { type: String },
  opposingCounsel: { type: String },

  notes:     [NoteSchema],
  documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
  tags:      [String],
}, { timestamps: true });

// Auto-generate matterNumber before first save
MatterSchema.pre('save', async function (next) {
  if (this.matterNumber) return next();
  const count = await mongoose.model('Matter').countDocuments({ firmId: this.firmId });
  const year  = new Date().getFullYear();
  this.matterNumber = `M-${year}-${String(count + 1).padStart(3, '0')}`;
  next();
});

MatterSchema.index({ firmId: 1, status: 1 });
MatterSchema.index({ firmId: 1, practiceArea: 1 });

module.exports = mongoose.model('Matter', MatterSchema);
