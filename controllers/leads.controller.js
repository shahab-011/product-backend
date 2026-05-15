const Lead   = require('../models/Lead.model');
const Matter = require('../models/Matter.model');
const Contact = require('../models/Contact.model');
const { sendSuccess, sendError } = require('../utils/response');

const STAGES  = ['New Lead','Contacted','Consultation','Proposal Sent','Won','Lost'];
const SOURCES = ['Website','Referral','LinkedIn','Advertisement','Walk-in','Phone','Other'];

exports.getStages  = (req, res) => sendSuccess(res, STAGES,  'Lead stages');
exports.getSources = (req, res) => sendSuccess(res, SOURCES, 'Lead sources');

exports.list = async (req, res) => {
  const { stage, assignedTo, practiceArea, q, limit = 200 } = req.query;
  const filter = { firmId: req.user._id };
  if (stage)        filter.stage        = stage;
  if (assignedTo)   filter.assignedTo   = assignedTo;
  if (practiceArea) filter.practiceArea = practiceArea;
  if (q) filter.$or = [
    { name:  { $regex: q, $options: 'i' } },
    { email: { $regex: q, $options: 'i' } },
  ];

  const leads = await Lead.find(filter)
    .populate('assignedTo', 'name email')
    .populate('convertedToMatterId', 'title matterNumber')
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();

  // Kanban counts
  const stageCounts = {};
  STAGES.forEach(s => { stageCounts[s] = 0; });
  leads.forEach(l => { if (stageCounts[l.stage] !== undefined) stageCounts[l.stage]++; });

  const totalValue = leads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const wonValue   = leads.filter(l => l.stage === 'Won').reduce((s, l) => s + (l.estimatedValue || 0), 0);

  sendSuccess(res, { leads, stageCounts, stats: { totalValue, wonValue, total: leads.length } }, 'Leads fetched');
};

exports.get = async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('assignedTo', 'name email')
    .populate('convertedToMatterId', 'title matterNumber')
    .lean();
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, lead, 'Lead fetched');
};

exports.create = async (req, res) => {
  const lead = await Lead.create({ ...req.body, firmId: req.user._id });
  sendSuccess(res, lead, 'Lead created', 201);
};

exports.update = async (req, res) => {
  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  ).populate('assignedTo', 'name email');
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, lead, 'Lead updated');
};

exports.updateStage = async (req, res) => {
  const { stage } = req.body;
  if (!STAGES.includes(stage)) return sendError(res, 'Invalid stage', 400);
  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    { stage, lastContactDate: new Date() },
    { new: true }
  );
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, lead, 'Lead stage updated');
};

exports.remove = async (req, res) => {
  const lead = await Lead.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, null, 'Lead deleted');
};

exports.convertToMatter = async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, firmId: req.user._id });
  if (!lead) return sendError(res, 'Lead not found', 404);
  if (lead.convertedToMatterId) return sendError(res, 'Lead already converted', 400);

  // Create a contact for the lead if email provided
  let contact = null;
  if (lead.email) {
    contact = await Contact.findOneAndUpdate(
      { firmId: req.user._id, email: lead.email },
      { $setOnInsert: { firmId: req.user._id, firstName: lead.name.split(' ')[0] || lead.name, lastName: lead.name.split(' ').slice(1).join(' '), email: lead.email, phone: lead.phone, type: 'client' } },
      { upsert: true, new: true }
    );
  }

  const matter = await Matter.create({
    firmId:       req.user._id,
    title:        req.body.title || `${lead.name} — ${lead.practiceArea || 'General'}`,
    practiceArea: lead.practiceArea,
    clientId:     contact?._id,
    clientName:   lead.name,
    description:  lead.description,
    status:       'active',
    stage:        'Intake',
    billingType:  'hourly',
  });

  lead.stage               = 'Won';
  lead.convertedToMatterId = matter._id;
  lead.convertedAt         = new Date();
  await lead.save();

  sendSuccess(res, { matter, lead }, 'Lead converted to matter', 201);
};
