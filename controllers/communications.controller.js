const CommunicationLog = require('../models/CommunicationLog.model');
const EmailTemplate    = require('../models/EmailTemplate.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const TYPES = [
  'Email Sent', 'Email Received',
  'Phone Call (Outbound)', 'Phone Call (Inbound)',
  'Video Call', 'Meeting (In-Person)', 'Court Appearance',
  'Text Message', 'Letter Sent', 'Letter Received', 'Note',
];

exports.getTypes = (req, res) => sendSuccess(res, TYPES, 'Communication types');

/* ── CRUD ────────────────────────────────────────────────────────── */

exports.list = async (req, res) => {
  const { matterId, contactId, type, from, to, q, limit = 200, page = 1 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isDeleted: { $ne: true } };

  if (matterId)  filter.matterId  = matterId;
  if (contactId) filter.contactId = contactId;
  if (type)      filter.type      = type;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }
  if (q) filter.$or = [
    { subject: { $regex: q, $options: 'i' } },
    { summary: { $regex: q, $options: 'i' } },
    { contact: { $regex: q, $options: 'i' } },
  ];

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    CommunicationLog.find(filter)
      .populate('matterId',  'title matterNumber')
      .populate('contactId', 'firstName lastName email')
      .populate('userId',    'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CommunicationLog.countDocuments(filter),
  ]);

  sendSuccess(res, { logs, total, page: Number(page) }, 'Communications fetched');
};

exports.get = async (req, res) => {
  const log = await CommunicationLog.findOne({
    _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true },
  })
    .populate('matterId',  'title matterNumber')
    .populate('contactId', 'firstName lastName email')
    .populate('userId',    'name email')
    .lean();
  if (!log) return sendError(res, 'Communication log not found', 404);
  sendSuccess(res, log, 'Communication fetched');
};

exports.create = async (req, res) => {
  const log = await CommunicationLog.create({
    ...req.body,
    firmId: getFirmId(req),
    userId: req.user._id,
    source: req.body.source || 'manual',
  });
  sendSuccess(res, log, 'Communication logged', 201);
};

exports.update = async (req, res) => {
  const log = await CommunicationLog.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    req.body,
    { new: true, runValidators: true }
  ).populate('matterId', 'title matterNumber');
  if (!log) return sendError(res, 'Communication log not found', 404);
  sendSuccess(res, log, 'Communication updated');
};

exports.remove = async (req, res) => {
  const log = await CommunicationLog.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { isDeleted: true },
    { new: true }
  );
  if (!log) return sendError(res, 'Communication log not found', 404);
  sendSuccess(res, null, 'Communication deleted');
};

/* ── Time entry from log ─────────────────────────────────────────── */

exports.createTimeEntryFromLog = async (req, res) => {
  const firmId = getFirmId(req);
  const log = await CommunicationLog.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } });
  if (!log) return sendError(res, 'Communication log not found', 404);
  if (log.timeEntryId) return sendError(res, 'Time entry already exists for this log', 400);

  const TimeEntry = require('../models/TimeEntry.model');
  const hours = req.body.hours != null ? Number(req.body.hours) : +(( log.duration || 15) / 60).toFixed(2);
  const rate  = req.body.rate  != null ? Number(req.body.rate)  : 0;

  const entry = await TimeEntry.create({
    firmId,
    matterId:              log.matterId,
    userId:                req.user._id,
    date:                  log.date,
    activityType:          'calls',
    description:           req.body.description || `${log.type}: ${log.subject || log.summary || ''}`.slice(0, 200),
    hours,
    rate,
    isBillable:            log.isBillable,
    linkedCommunicationId: log._id,
  });

  log.timeEntryId = entry._id;
  await log.save();

  sendSuccess(res, entry, 'Time entry created', 201);
};

/* ── Gmail / Outlook filing ─────────────────────────────────────── */

exports.fileEmailFromGmail = async (req, res) => {
  const firmId = getFirmId(req);
  const { messageId, subject, from, body, matterId, date } = req.body;

  if (messageId) {
    const existing = await CommunicationLog.findOne({ firmId, externalId: messageId });
    if (existing) return sendSuccess(res, existing, 'Email already filed');
  }

  const log = await CommunicationLog.create({
    firmId, userId: req.user._id,
    matterId:   matterId || undefined,
    type:       'Email Received',
    direction:  'Inbound',
    contact:    from || '',
    subject:    subject || '(no subject)',
    body:       body || '',
    date:       date ? new Date(date) : new Date(),
    externalId: messageId || undefined,
    source:     'gmail',
  });
  sendSuccess(res, log, 'Email filed from Gmail', 201);
};

exports.fileEmailFromOutlook = async (req, res) => {
  const firmId = getFirmId(req);
  const { messageId, subject, from, body, matterId, date } = req.body;

  if (messageId) {
    const existing = await CommunicationLog.findOne({ firmId, externalId: messageId });
    if (existing) return sendSuccess(res, existing, 'Email already filed');
  }

  const log = await CommunicationLog.create({
    firmId, userId: req.user._id,
    matterId:   matterId || undefined,
    type:       'Email Received',
    direction:  'Inbound',
    contact:    from || '',
    subject:    subject || '(no subject)',
    body:       body || '',
    date:       date ? new Date(date) : new Date(),
    externalId: messageId || undefined,
    source:     'outlook',
  });
  sendSuccess(res, log, 'Email filed from Outlook', 201);
};

/* ── Timeline ────────────────────────────────────────────────────── */

exports.getContactTimeline = async (req, res) => {
  const firmId = getFirmId(req);
  const { type, from, to, limit = 100 } = req.query;
  const filter = { firmId, contactId: req.params.contactId, isDeleted: { $ne: true } };
  if (type) filter.type = type;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const logs = await CommunicationLog.find(filter)
    .populate('matterId', 'title matterNumber')
    .populate('userId',   'name')
    .sort({ date: -1 })
    .limit(Number(limit))
    .lean();
  sendSuccess(res, logs, 'Contact timeline fetched');
};

exports.exportMatterTimeline = async (req, res) => {
  const firmId = getFirmId(req);
  const { type, from, to } = req.query;
  const filter = { firmId, matterId: req.params.matterId, isDeleted: { $ne: true } };
  if (type) filter.type = type;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const logs = await CommunicationLog.find(filter)
    .populate('matterId',  'title matterNumber')
    .populate('contactId', 'firstName lastName')
    .populate('userId',    'name')
    .sort({ date: 1 })
    .lean();

  let matter = null;
  try {
    const Matter = require('../models/Matter.model');
    matter = await Matter.findById(req.params.matterId).select('title matterNumber').lean();
  } catch {}

  sendSuccess(res, { matter, logs, exportedAt: new Date() }, 'Matter timeline exported');
};

/* ── Email Templates ─────────────────────────────────────────────── */

exports.listEmailTemplates = async (req, res) => {
  const templates = await EmailTemplate.find({ firmId: getFirmId(req) }).sort({ createdAt: -1 }).lean();
  sendSuccess(res, templates, 'Email templates fetched');
};

exports.createEmailTemplate = async (req, res) => {
  const tpl = await EmailTemplate.create({ ...req.body, firmId: getFirmId(req), createdBy: req.user._id });
  sendSuccess(res, tpl, 'Email template created', 201);
};

exports.updateEmailTemplate = async (req, res) => {
  const tpl = await EmailTemplate.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    req.body,
    { new: true, runValidators: true }
  );
  if (!tpl) return sendError(res, 'Template not found', 404);
  sendSuccess(res, tpl, 'Email template updated');
};

exports.deleteEmailTemplate = async (req, res) => {
  const tpl = await EmailTemplate.findOneAndDelete({ _id: req.params.id, firmId: getFirmId(req) });
  if (!tpl) return sendError(res, 'Template not found', 404);
  sendSuccess(res, null, 'Email template deleted');
};
