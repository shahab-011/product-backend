const IntakeForm = require('../models/IntakeForm.model');
const Lead       = require('../models/Lead.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

exports.list = async (req, res) => {
  const forms = await IntakeForm.find({ firmId: getFirmId(req), isDeleted: { $ne: true } })
    .sort({ createdAt: -1 }).lean();
  sendSuccess(res, forms, 'Intake forms fetched');
};

exports.get = async (req, res) => {
  const form = await IntakeForm.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } }).lean();
  if (!form) return sendError(res, 'Form not found', 404);
  sendSuccess(res, form, 'Form fetched');
};

exports.create = async (req, res) => {
  const form = await IntakeForm.create({ ...req.body, firmId: getFirmId(req) });
  sendSuccess(res, form, 'Intake form created', 201);
};

exports.update = async (req, res) => {
  const form = await IntakeForm.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    req.body,
    { new: true, runValidators: true }
  );
  if (!form) return sendError(res, 'Form not found', 404);
  sendSuccess(res, form, 'Form updated');
};

exports.remove = async (req, res) => {
  const form = await IntakeForm.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { isDeleted: true },
    { new: true }
  );
  if (!form) return sendError(res, 'Form not found', 404);
  sendSuccess(res, null, 'Form deleted');
};

// Public — no auth
exports.getPublicForm = async (req, res) => {
  const form = await IntakeForm.findOne({ slug: req.params.slug, isActive: true, isDeleted: { $ne: true } })
    .select('-firmId').lean();
  if (!form) return sendError(res, 'Form not found or inactive', 404);
  sendSuccess(res, form, 'Form fetched');
};

// Public — creates a Lead
exports.submitForm = async (req, res) => {
  const form = await IntakeForm.findOne({ slug: req.params.slug, isActive: true, isDeleted: { $ne: true } });
  if (!form) return sendError(res, 'Form not found or inactive', 404);

  const { name, email, phone, responses } = req.body;
  if (!name) return sendError(res, 'Name is required', 400);

  const lead = await Lead.create({
    firmId:        form.firmId,
    name,
    email:         email || undefined,
    phone:         phone || undefined,
    intakeFormId:  form._id,
    formResponses: responses || req.body,
    source:        'Website Form',
    stage:         'New Lead',
    activityLog:   [{ type: 'created', description: `Submitted via form: ${form.name}` }],
  });

  form.usageCount = (form.usageCount || 0) + 1;
  await form.save();

  sendSuccess(res, { leadId: lead._id, successMessage: form.successMessage }, 'Form submitted', 201);
};

exports.listResponses = async (req, res) => {
  const form = await IntakeForm.findOne({ _id: req.params.id, firmId: getFirmId(req) }).lean();
  if (!form) return sendError(res, 'Form not found', 404);

  const leads = await Lead.find({ intakeFormId: form._id })
    .select('name email phone formResponses createdAt stage score')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, leads, 'Form responses fetched');
};
