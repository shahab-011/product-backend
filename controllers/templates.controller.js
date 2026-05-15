const DocTemplate = require('../models/DocTemplate.model');
const { sendSuccess, sendError } = require('../utils/response');

const CATEGORIES = ['NDA','Retainer','Employment','Lease','Settlement','Corporate','Custom'];

exports.getCategories = (req, res) => sendSuccess(res, CATEGORIES, 'Template categories');

exports.list = async (req, res) => {
  const { category, q, limit = 100 } = req.query;
  const filter = { firmId: req.user._id };
  if (category) filter.category = category;
  if (q) filter.name = { $regex: q, $options: 'i' };

  const templates = await DocTemplate.find(filter)
    .populate('createdBy', 'name')
    .sort({ usageCount: -1, createdAt: -1 })
    .limit(Number(limit))
    .lean();

  sendSuccess(res, templates, 'Templates fetched');
};

exports.get = async (req, res) => {
  const template = await DocTemplate.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('createdBy', 'name')
    .lean();
  if (!template) return sendError(res, 'Template not found', 404);
  sendSuccess(res, template, 'Template fetched');
};

exports.create = async (req, res) => {
  const template = await DocTemplate.create({
    ...req.body,
    firmId:    req.user._id,
    createdBy: req.user._id,
  });
  sendSuccess(res, template, 'Template created', 201);
};

exports.update = async (req, res) => {
  const template = await DocTemplate.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!template) return sendError(res, 'Template not found', 404);
  sendSuccess(res, template, 'Template updated');
};

exports.remove = async (req, res) => {
  const template = await DocTemplate.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!template) return sendError(res, 'Template not found', 404);
  sendSuccess(res, null, 'Template deleted');
};

exports.generate = async (req, res) => {
  const template = await DocTemplate.findOne({ _id: req.params.id, firmId: req.user._id });
  if (!template) return sendError(res, 'Template not found', 404);

  const { fieldValues = {} } = req.body;
  let content = template.content;

  // Replace all {{field}} placeholders
  Object.entries(fieldValues).forEach(([key, value]) => {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  });

  // Increment usage
  template.usageCount = (template.usageCount || 0) + 1;
  await template.save();

  sendSuccess(res, {
    templateName: template.name,
    category:     template.category,
    content,
    generatedAt:  new Date(),
  }, 'Document generated');
};
