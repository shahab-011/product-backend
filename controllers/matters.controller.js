const Matter      = require('../models/Matter.model');
const Contact     = require('../models/Contact.model');
const CustomField = require('../models/CustomField.model');
const { sendSuccess, sendError } = require('../utils/response');

const PRACTICE_AREAS = [
  'Family Law','Criminal','Contract','Property','Immigration',
  'Employment','IP','Personal Injury','Tax','Civil','Corporate','Other',
];
const MATTER_STAGES = ['Intake','Open','In Discovery','Pre-Trial','Trial','Settlement','Closed','Archived'];

const getFirmId = (req) => req.user.firmId || req.user._id;

/* ── Static lists ─────────────────────────────────────────────── */
exports.getPracticeAreas = (req, res) => sendSuccess(res, PRACTICE_AREAS, 'Practice areas');
exports.getMatterStages  = (req, res) => sendSuccess(res, MATTER_STAGES, 'Matter stages');

/* ── CRUD ─────────────────────────────────────────────────────── */
exports.list = async (req, res) => {
  const { status, practiceArea, stage, q, limit = 50, page = 1 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isDeleted: { $ne: true } };
  if (status)       filter.status = status;
  if (practiceArea) filter.practiceArea = practiceArea;
  if (stage)        filter.stage = stage;
  if (q)            filter.title = { $regex: q, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [matters, total] = await Promise.all([
    Matter.find(filter)
      .select('-notes')
      .populate('clientId', 'firstName lastName company email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
      .lean(),
    Matter.countDocuments(filter),
  ]);
  sendSuccess(res, { matters, total, page: Number(page), limit: Number(limit) }, 'Matters fetched');
};

exports.get = async (req, res) => {
  const matter = await Matter.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } })
    .populate('clientId', 'firstName lastName company email phone')
    .populate('coClients', 'firstName lastName company email')
    .populate('assignedTo', 'name email role')
    .lean();
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter fetched');
};

exports.create = async (req, res) => {
  const matter = await Matter.create({ ...req.body, firmId: getFirmId(req) });
  if (matter.clientId) {
    await Contact.findByIdAndUpdate(matter.clientId, { $addToSet: { relatedMatters: matter._id } });
  }
  sendSuccess(res, matter, 'Matter created', 201);
};

exports.update = async (req, res) => {
  const { closureReason, closureNotes, isDeleted, ...body } = req.body;
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    body,
    { new: true, runValidators: true }
  )
    .populate('clientId', 'firstName lastName company email')
    .populate('assignedTo', 'name email role');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter updated');
};

exports.remove = async (req, res) => {
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { isDeleted: true },
    { new: true }
  );
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, null, 'Matter deleted');
};

/* ── Stage / Status actions ───────────────────────────────────── */
exports.closeMatter = async (req, res) => {
  const { closureReason, closureNotes } = req.body;
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { status: 'closed', stage: 'Closed', closeDate: new Date(), closureReason, closureNotes },
    { new: true }
  ).populate('clientId', 'firstName lastName company email');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter closed');
};

exports.archiveMatter = async (req, res) => {
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { status: 'archived', stage: 'Archived' },
    { new: true }
  ).populate('clientId', 'firstName lastName company email');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter archived');
};

exports.reopenMatter = async (req, res) => {
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { status: 'active', stage: 'Open', $unset: { closeDate: 1, closureReason: 1, closureNotes: 1 } },
    { new: true }
  ).populate('clientId', 'firstName lastName company email');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter reopened');
};

/* ── Notes ────────────────────────────────────────────────────── */
exports.getNotes = async (req, res) => {
  const matter = await Matter.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } })
    .select('notes').populate('notes.createdBy', 'name');
  if (!matter) return sendError(res, 'Matter not found', 404);
  const sorted = [...matter.notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  sendSuccess(res, sorted, 'Notes fetched');
};

exports.addNote = async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return sendError(res, 'Note text required', 400);
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { $push: { notes: { text: text.trim(), createdBy: req.user._id } } },
    { new: true }
  ).select('notes').populate('notes.createdBy', 'name');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter.notes[matter.notes.length - 1], 'Note added', 201);
};

exports.updateNote = async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return sendError(res, 'Note text required', 400);
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), 'notes._id': req.params.noteId },
    { $set: { 'notes.$.text': text.trim(), 'notes.$.updatedAt': new Date() } },
    { new: true }
  ).select('notes').populate('notes.createdBy', 'name');
  if (!matter) return sendError(res, 'Matter or note not found', 404);
  const note = matter.notes.id(req.params.noteId);
  sendSuccess(res, note, 'Note updated');
};

exports.togglePinNote = async (req, res) => {
  const matter = await Matter.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!matter) return sendError(res, 'Matter not found', 404);
  const note = matter.notes.id(req.params.noteId);
  if (!note) return sendError(res, 'Note not found', 404);
  note.isPinned = !note.isPinned;
  await matter.save();
  sendSuccess(res, note, `Note ${note.isPinned ? 'pinned' : 'unpinned'}`);
};

exports.deleteNote = async (req, res) => {
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { $pull: { notes: { _id: req.params.noteId } } },
    { new: true }
  );
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, null, 'Note deleted');
};

/* ── Contact linking ──────────────────────────────────────────── */
exports.linkContact = async (req, res) => {
  const { contactId, role = 'co-client' } = req.body;
  if (!contactId) return sendError(res, 'contactId required', 400);
  const update = role === 'client'
    ? { clientId: contactId }
    : { $addToSet: { coClients: contactId } };
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    update,
    { new: true }
  )
    .populate('clientId', 'firstName lastName company email')
    .populate('coClients', 'firstName lastName company email');
  if (!matter) return sendError(res, 'Matter not found', 404);
  await Contact.findByIdAndUpdate(contactId, { $addToSet: { relatedMatters: matter._id } });
  sendSuccess(res, matter, 'Contact linked');
};

exports.unlinkContact = async (req, res) => {
  const { contactId } = req.params;
  const matter = await Matter.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!matter) return sendError(res, 'Matter not found', 404);
  if (matter.clientId?.toString() === contactId) {
    matter.clientId = undefined;
  } else {
    matter.coClients.pull(contactId);
  }
  await matter.save();
  await Contact.findByIdAndUpdate(contactId, { $pull: { relatedMatters: matter._id } });
  sendSuccess(res, null, 'Contact unlinked');
};

/* ── Custom Fields ────────────────────────────────────────────── */
exports.listCustomFields = async (req, res) => {
  const fields = await CustomField.find({ firmId: getFirmId(req), isActive: true }).sort({ order: 1 }).lean();
  sendSuccess(res, fields, 'Custom fields');
};

exports.createCustomField = async (req, res) => {
  const { name, type, options, isRequired, practiceAreas, order } = req.body;
  if (!name?.trim()) return sendError(res, 'Field name required', 400);
  const slug = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const field = await CustomField.create({
    firmId: getFirmId(req), name: name.trim(), slug, type, options, isRequired, practiceAreas, order,
  });
  sendSuccess(res, field, 'Custom field created', 201);
};

exports.updateCustomField = async (req, res) => {
  const field = await CustomField.findOneAndUpdate(
    { _id: req.params.fieldId, firmId: getFirmId(req) },
    req.body,
    { new: true, runValidators: true }
  );
  if (!field) return sendError(res, 'Custom field not found', 404);
  sendSuccess(res, field, 'Custom field updated');
};

exports.deleteCustomField = async (req, res) => {
  const field = await CustomField.findOneAndUpdate(
    { _id: req.params.fieldId, firmId: getFirmId(req) },
    { isActive: false }
  );
  if (!field) return sendError(res, 'Custom field not found', 404);
  sendSuccess(res, null, 'Custom field deactivated');
};

/* ── Apply task template ──────────────────────────────────────── */
exports.applyTemplate = async (req, res) => {
  const { templateId } = req.body;
  const Task = require('../models/Task.model');
  const templates = getTaskTemplates();
  const tpl = templates.find(t => t.id === templateId);
  if (!tpl) return sendError(res, 'Template not found', 404);

  const matter = await Matter.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } });
  if (!matter) return sendError(res, 'Matter not found', 404);

  const tasks = await Task.insertMany(
    tpl.tasks.map((t, i) => ({
      firmId: getFirmId(req), matterId: matter._id,
      createdBy: req.user._id, title: t.title,
      activityType: t.activityType, priority: t.priority,
      dueDate: t.daysFromNow ? new Date(Date.now() + t.daysFromNow * 86400000) : undefined,
      order: i,
    }))
  );
  sendSuccess(res, tasks, 'Template applied', 201);
};

function getTaskTemplates() {
  return [
    {
      id: 'litigation',
      name: 'Litigation Checklist',
      tasks: [
        { title: 'File initial pleadings',  activityType: 'drafting',  priority: 'high',   daysFromNow: 7  },
        { title: 'Serve opposing party',    activityType: 'court',     priority: 'high',   daysFromNow: 14 },
        { title: 'Discovery requests',      activityType: 'research',  priority: 'medium', daysFromNow: 30 },
        { title: 'Deposition preparation',  activityType: 'meeting',   priority: 'medium', daysFromNow: 45 },
        { title: 'Pre-trial motions',       activityType: 'drafting',  priority: 'high',   daysFromNow: 60 },
      ],
    },
    {
      id: 'contract_review',
      name: 'Contract Review',
      tasks: [
        { title: 'Initial contract review',  activityType: 'review',   priority: 'high',   daysFromNow: 3  },
        { title: 'Identify risk clauses',    activityType: 'research', priority: 'high',   daysFromNow: 5  },
        { title: 'Draft revision memo',      activityType: 'drafting', priority: 'medium', daysFromNow: 7  },
        { title: 'Client review call',       activityType: 'meeting',  priority: 'medium', daysFromNow: 10 },
        { title: 'Final document sign-off',  activityType: 'admin',    priority: 'low',    daysFromNow: 14 },
      ],
    },
    {
      id: 'corporate_setup',
      name: 'Company Registration',
      tasks: [
        { title: 'Name availability certificate', activityType: 'admin',    priority: 'high',   daysFromNow: 5  },
        { title: 'Draft Memorandum & Articles',   activityType: 'drafting', priority: 'high',   daysFromNow: 14 },
        { title: 'File with SECP',                activityType: 'court',    priority: 'high',   daysFromNow: 21 },
        { title: 'Obtain NTN',                    activityType: 'admin',    priority: 'medium', daysFromNow: 30 },
        { title: 'Bank account opening',          activityType: 'admin',    priority: 'low',    daysFromNow: 35 },
      ],
    },
  ];
}

exports.getTaskTemplates = (req, res) => sendSuccess(res, getTaskTemplates(), 'Task templates fetched');
