const Lead    = require('../models/Lead.model');
const Matter  = require('../models/Matter.model');
const Contact = require('../models/Contact.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const STAGES  = ['New Lead','Contacted','Consultation Scheduled','Proposal Sent','Hired','Not Hired'];
const SOURCES = ['Website Form','Referral','Social Media','Paid Ad','Phone Call','Walk-in','Bar Referral','Other'];

exports.getStages  = (req, res) => sendSuccess(res, STAGES,  'Lead stages');
exports.getSources = (req, res) => sendSuccess(res, SOURCES, 'Lead sources');

exports.list = async (req, res) => {
  const { stage, assignedTo, practiceArea, q, limit = 500 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isDeleted: { $ne: true } };
  if (stage)        filter.stage        = stage;
  if (assignedTo)   filter.assignedTo   = assignedTo;
  if (practiceArea) filter.practiceArea = practiceArea;
  if (q) filter.$or = [
    { name:  { $regex: q, $options: 'i' } },
    { email: { $regex: q, $options: 'i' } },
    { phone: { $regex: q, $options: 'i' } },
  ];

  const leads = await Lead.find(filter)
    .populate('assignedTo', 'name email')
    .populate('convertedToMatterId', 'title matterNumber')
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();

  const stageCounts = {};
  const stageValues = {};
  STAGES.forEach(s => { stageCounts[s] = 0; stageValues[s] = 0; });
  leads.forEach(l => {
    if (stageCounts[l.stage] !== undefined) {
      stageCounts[l.stage]++;
      stageValues[l.stage] += l.estimatedValue || 0;
    }
  });

  const active     = leads.filter(l => !['Hired','Not Hired'].includes(l.stage));
  const totalValue = active.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const wonValue   = leads.filter(l => l.stage === 'Hired').reduce((s, l) => s + (l.estimatedValue || 0), 0);

  sendSuccess(res, {
    leads, stageCounts, stageValues,
    stats: { totalValue, wonValue, total: leads.length, active: active.length },
  }, 'Leads fetched');
};

exports.get = async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } })
    .populate('assignedTo', 'name email')
    .populate('convertedToMatterId', 'title matterNumber')
    .lean();
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, lead, 'Lead fetched');
};

exports.create = async (req, res) => {
  const firmId = getFirmId(req);
  const lead = await Lead.create({
    ...req.body,
    firmId,
    activityLog: [{ type: 'created', description: 'Lead created', userId: req.user._id }],
  });
  sendSuccess(res, lead, 'Lead created', 201);
};

exports.update = async (req, res) => {
  const { activityLog, ...body } = req.body;
  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { ...body, $push: { activityLog: { type: 'updated', description: 'Lead updated', userId: req.user._id } } },
    { new: true, runValidators: true }
  ).populate('assignedTo', 'name email');
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, lead, 'Lead updated');
};

exports.updateStage = async (req, res) => {
  const { stage } = req.body;
  if (!STAGES.includes(stage)) return sendError(res, 'Invalid stage', 400);
  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    {
      stage,
      lastContactDate: new Date(),
      $push: { activityLog: { type: 'stage_changed', description: `Stage → ${stage}`, userId: req.user._id } },
    },
    { new: true }
  );
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, lead, 'Stage updated');
};

exports.remove = async (req, res) => {
  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { isDeleted: true },
    { new: true }
  );
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, null, 'Lead deleted');
};

exports.convertToMatter = async (req, res) => {
  const firmId = getFirmId(req);
  const lead = await Lead.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } });
  if (!lead) return sendError(res, 'Lead not found', 404);
  if (lead.isConverted) return sendError(res, 'Lead already converted', 400);

  let contact = null;
  if (lead.email) {
    contact = await Contact.findOneAndUpdate(
      { firmId, email: lead.email },
      {
        $setOnInsert: {
          firmId,
          firstName: lead.name.split(' ')[0] || lead.name,
          lastName:  lead.name.split(' ').slice(1).join(' ') || '',
          email:     lead.email,
          phone:     lead.phone || undefined,
          type:      'client',
        },
      },
      { upsert: true, new: true }
    );
  }

  const matter = await Matter.create({
    firmId,
    title:            req.body.title || `${lead.name} — ${lead.practiceArea || 'General'}`,
    practiceArea:     lead.practiceArea,
    clientId:         contact?._id,
    clientName:       lead.name,
    description:      lead.description,
    status:           'active',
    stage:            'Intake',
    billingType:      'hourly',
    assignedAttorney: req.body.assignedAttorney || lead.assignedTo,
  });

  lead.stage               = 'Hired';
  lead.convertedToMatterId  = matter._id;
  lead.convertedToContactId = contact?._id;
  lead.convertedAt          = new Date();
  lead.isConverted          = true;
  lead.activityLog.push({ type: 'converted', description: `Converted → matter "${matter.title}"`, userId: req.user._id });
  await lead.save();

  sendSuccess(res, { matter, contact, lead }, 'Lead converted to matter', 201);
};

exports.bookConsultation = async (req, res) => {
  const { consultationDate, consultationAttorney } = req.body;
  if (!consultationDate) return sendError(res, 'consultationDate required', 400);

  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    {
      consultationDate:     new Date(consultationDate),
      consultationAttorney: consultationAttorney || undefined,
      stage:                'Consultation Scheduled',
      $push: {
        activityLog: {
          type:        'consultation_booked',
          description: `Consultation booked for ${new Date(consultationDate).toLocaleDateString()}`,
          userId:      req.user._id,
        },
      },
    },
    { new: true }
  );
  if (!lead) return sendError(res, 'Lead not found', 404);
  sendSuccess(res, lead, 'Consultation booked');
};

exports.getPipelineAnalytics = async (req, res) => {
  const firmId = getFirmId(req);
  const match  = { firmId, isDeleted: { $ne: true } };

  const [byStage, bySource, byArea] = await Promise.all([
    Lead.aggregate([{ $match: match }, { $group: { _id: '$stage',        count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } }]),
    Lead.aggregate([{ $match: match }, { $group: { _id: '$source',       count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } }]),
    Lead.aggregate([{ $match: match }, { $group: { _id: '$practiceArea', count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } }]),
  ]);

  const total          = await Lead.countDocuments(match);
  const hired          = await Lead.countDocuments({ ...match, stage: 'Hired' });
  const conversionRate = total ? Math.round((hired / total) * 100) : 0;
  const pipelineValue  = byStage
    .filter(s => !['Hired','Not Hired'].includes(s._id))
    .reduce((sum, s) => sum + s.value, 0);
  const wonValue = (byStage.find(s => s._id === 'Hired') || {}).value || 0;

  sendSuccess(res, {
    byStage, bySource, byArea,
    summary: { total, hired, conversionRate, pipelineValue, wonValue },
  }, 'Analytics fetched');
};

exports.getSourceAnalytics = async (req, res) => {
  const firmId = getFirmId(req);
  const sources = await Lead.aggregate([
    { $match: { firmId, isDeleted: { $ne: true } } },
    {
      $group: {
        _id:   '$source',
        total: { $sum: 1 },
        hired: { $sum: { $cond: [{ $eq: ['$stage', 'Hired'] }, 1, 0] } },
        value: { $sum: '$estimatedValue' },
      },
    },
    {
      $project: {
        source: '$_id',
        total:  1, hired: 1, value: 1,
        conversionRate: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$hired', '$total'] }, 100] }, 0] },
      },
    },
    { $sort: { total: -1 } },
  ]);
  sendSuccess(res, sources, 'Source analytics fetched');
};
