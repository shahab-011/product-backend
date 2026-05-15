const Matter  = require('../models/Matter.model');
const Contact = require('../models/Contact.model');
const { sendSuccess, sendError } = require('../utils/response');

const PRACTICE_AREAS = [
  'Family Law','Criminal','Contract','Property','Immigration',
  'Employment','IP','Personal Injury','Tax','Civil','Corporate','Other',
];
const MATTER_STAGES = ['Intake','Open','In Discovery','Pre-Trial','Trial','Settlement','Closed','Archived'];

/* ── Static lists ──────────────────────────────────────────────── */
exports.getPracticeAreas = (req, res) =>
  sendSuccess(res, PRACTICE_AREAS, 'Practice areas');

exports.getMatterStages = (req, res) =>
  sendSuccess(res, MATTER_STAGES, 'Matter stages');

/* ── CRUD ──────────────────────────────────────────────────────── */
exports.list = async (req, res) => {
  const { status, practiceArea, stage, q, limit = 50, page = 1 } = req.query;
  const filter = { firmId: req.user._id };
  if (status)       filter.status = status;
  if (practiceArea) filter.practiceArea = practiceArea;
  if (stage)        filter.stage = stage;
  if (q)            filter.title = { $regex: q, $options: 'i' };

  const skip  = (Number(page) - 1) * Number(limit);
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
  const matter = await Matter.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('clientId', 'firstName lastName company email phone')
    .populate('assignedTo', 'name email role')
    .lean();
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter fetched');
};

exports.create = async (req, res) => {
  const matter = await Matter.create({ ...req.body, firmId: req.user._id });
  // Link matter to contact if clientId provided
  if (matter.clientId) {
    await Contact.findByIdAndUpdate(matter.clientId, { $addToSet: { relatedMatters: matter._id } });
  }
  sendSuccess(res, matter, 'Matter created', 201);
};

exports.update = async (req, res) => {
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  ).populate('clientId', 'firstName lastName company email');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter updated');
};

exports.remove = async (req, res) => {
  const matter = await Matter.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, null, 'Matter deleted');
};

/* ── Notes ─────────────────────────────────────────────────────── */
exports.getNotes = async (req, res) => {
  const matter = await Matter.findOne({ _id: req.params.id, firmId: req.user._id })
    .select('notes').populate('notes.createdBy', 'name');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter.notes, 'Notes fetched');
};

exports.addNote = async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return sendError(res, 'Note text required', 400);
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    { $push: { notes: { text: text.trim(), createdBy: req.user._id } } },
    { new: true }
  ).select('notes').populate('notes.createdBy', 'name');
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter.notes[matter.notes.length - 1], 'Note added', 201);
};

exports.deleteNote = async (req, res) => {
  const matter = await Matter.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    { $pull: { notes: { _id: req.params.noteId } } },
    { new: true }
  );
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, null, 'Note deleted');
};

/* ── Apply task template ────────────────────────────────────────── */
exports.applyTemplate = async (req, res) => {
  const { templateId } = req.body;
  const Task = require('../models/Task.model');
  const templates = getTaskTemplates();
  const tpl = templates.find(t => t.id === templateId);
  if (!tpl) return sendError(res, 'Template not found', 404);

  const matter = await Matter.findOne({ _id: req.params.id, firmId: req.user._id });
  if (!matter) return sendError(res, 'Matter not found', 404);

  const tasks = await Task.insertMany(
    tpl.tasks.map((t, i) => ({
      firmId: req.user._id, matterId: matter._id,
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
        { title: 'File initial pleadings', activityType: 'drafting', priority: 'high', daysFromNow: 7 },
        { title: 'Serve opposing party', activityType: 'court', priority: 'high', daysFromNow: 14 },
        { title: 'Discovery requests', activityType: 'research', priority: 'medium', daysFromNow: 30 },
        { title: 'Deposition preparation', activityType: 'meeting', priority: 'medium', daysFromNow: 45 },
        { title: 'Pre-trial motions', activityType: 'drafting', priority: 'high', daysFromNow: 60 },
      ],
    },
    {
      id: 'contract_review',
      name: 'Contract Review',
      tasks: [
        { title: 'Initial contract review', activityType: 'review', priority: 'high', daysFromNow: 3 },
        { title: 'Identify risk clauses', activityType: 'research', priority: 'high', daysFromNow: 5 },
        { title: 'Draft revision memo', activityType: 'drafting', priority: 'medium', daysFromNow: 7 },
        { title: 'Client review call', activityType: 'meeting', priority: 'medium', daysFromNow: 10 },
        { title: 'Final document sign-off', activityType: 'admin', priority: 'low', daysFromNow: 14 },
      ],
    },
    {
      id: 'corporate_setup',
      name: 'Company Registration',
      tasks: [
        { title: 'Obtain name availability certificate', activityType: 'admin', priority: 'high', daysFromNow: 5 },
        { title: 'Draft Memorandum & Articles', activityType: 'drafting', priority: 'high', daysFromNow: 14 },
        { title: 'File with SECP', activityType: 'court', priority: 'high', daysFromNow: 21 },
        { title: 'Obtain NTN', activityType: 'admin', priority: 'medium', daysFromNow: 30 },
        { title: 'Bank account opening', activityType: 'admin', priority: 'low', daysFromNow: 35 },
      ],
    },
  ];
}

exports.getTaskTemplates = (req, res) =>
  sendSuccess(res, getTaskTemplates(), 'Task templates fetched');
