const DocTemplate      = require('../models/DocTemplate.model');
const CourtForm        = require('../models/CourtForm.model');
const GeneratedDocument = require('../models/GeneratedDocument.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const CATEGORIES = DocTemplate.TEMPLATE_CATEGORIES || [
  'NDA', 'Retainer Agreement', 'Engagement Letter', 'Demand Letter',
  'Settlement Agreement', 'Lease', 'Employment Contract', 'Corporate Resolution',
  'Court Motion', 'Pleading', 'Discovery', 'Custom',
];

exports.getCategories = (req, res) => sendSuccess(res, CATEGORIES, 'Template categories');

/* ── List ──────────────────────────────────────────────────────── */
exports.list = async (req, res) => {
  const firmId = getFirmId(req);
  const { category, q, isFavorite, practiceArea, limit = 100, page = 1 } = req.query;

  const filter = { firmId, isActive: { $ne: false } };
  if (category)    filter.category    = category;
  if (isFavorite === 'true') filter.isFavorite = true;
  if (practiceArea) filter.practiceAreas = practiceArea;
  if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { description: new RegExp(q, 'i') }];

  const skip = (Number(page) - 1) * Number(limit);
  const [templates, total] = await Promise.all([
    DocTemplate.find(filter)
      .populate('createdBy', 'name')
      .sort({ isFavorite: -1, usageCount: -1, createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    DocTemplate.countDocuments(filter),
  ]);
  sendSuccess(res, { templates, total, page: Number(page) }, 'Templates fetched');
};

/* ── Get ───────────────────────────────────────────────────────── */
exports.get = async (req, res) => {
  const firmId = getFirmId(req);
  const template = await DocTemplate.findOne({ _id: req.params.id, firmId })
    .populate('createdBy', 'name')
    .populate('versions.updatedBy', 'name')
    .lean();
  if (!template) return sendError(res, 'Template not found', 404);
  sendSuccess(res, template, 'Template fetched');
};

/* ── Create ────────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  const firmId = getFirmId(req);
  const template = await DocTemplate.create({
    ...req.body,
    firmId,
    createdBy:      req.user._id,
    currentVersion: 1,
    versions:       [],
  });
  const populated = await DocTemplate.findById(template._id).populate('createdBy', 'name').lean();
  sendSuccess(res, populated, 'Template created', 201);
};

/* ── Update (archives previous version) ────────────────────────── */
exports.update = async (req, res) => {
  const firmId = getFirmId(req);
  const existing = await DocTemplate.findOne({ _id: req.params.id, firmId });
  if (!existing) return sendError(res, 'Template not found', 404);

  // Archive current content as a version entry
  if (req.body.content && req.body.content !== existing.content) {
    existing.versions.push({
      versionNumber: existing.currentVersion || 1,
      content:       existing.content,
      fields:        existing.fields,
      updatedBy:     req.user._id,
      updatedAt:     new Date(),
      note:          req.body.versionNote || '',
    });
    existing.currentVersion = (existing.currentVersion || 1) + 1;
  }

  const { versionNote, ...updateData } = req.body;
  Object.assign(existing, updateData);
  await existing.save();

  const populated = await DocTemplate.findById(existing._id).populate('createdBy', 'name').lean();
  sendSuccess(res, populated, 'Template updated');
};

/* ── Soft-delete ────────────────────────────────────────────────── */
exports.remove = async (req, res) => {
  const firmId = getFirmId(req);
  const template = await DocTemplate.findOneAndUpdate(
    { _id: req.params.id, firmId },
    { isActive: false },
    { new: true }
  );
  if (!template) return sendError(res, 'Template not found', 404);
  sendSuccess(res, null, 'Template deleted');
};

/* ── Toggle favorite ────────────────────────────────────────────── */
exports.toggleFavorite = async (req, res) => {
  const firmId = getFirmId(req);
  const template = await DocTemplate.findOne({ _id: req.params.id, firmId });
  if (!template) return sendError(res, 'Template not found', 404);
  template.isFavorite = !template.isFavorite;
  await template.save();
  sendSuccess(res, { isFavorite: template.isFavorite }, 'Favorite toggled');
};

/* ── Version history ────────────────────────────────────────────── */
exports.listVersions = async (req, res) => {
  const firmId = getFirmId(req);
  const template = await DocTemplate.findOne({ _id: req.params.id, firmId })
    .populate('versions.updatedBy', 'name').lean();
  if (!template) return sendError(res, 'Template not found', 404);
  sendSuccess(res, (template.versions || []).slice().reverse(), 'Versions fetched');
};

exports.restoreVersion = async (req, res) => {
  const firmId = getFirmId(req);
  const template = await DocTemplate.findOne({ _id: req.params.id, firmId });
  if (!template) return sendError(res, 'Template not found', 404);

  const version = template.versions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);

  // Archive current before restoring
  template.versions.push({
    versionNumber: template.currentVersion,
    content:       template.content,
    fields:        template.fields,
    updatedBy:     req.user._id,
    updatedAt:     new Date(),
    note:          `Auto-archived before restore to v${version.versionNumber}`,
  });
  template.content        = version.content;
  template.fields         = version.fields;
  template.currentVersion = (template.currentVersion || 1) + 1;
  await template.save();

  sendSuccess(res, template, `Restored to version ${version.versionNumber}`);
};

/* ── Generate document ──────────────────────────────────────────── */
exports.generate = async (req, res) => {
  const firmId = getFirmId(req);
  const template = await DocTemplate.findOne({ _id: req.params.id, firmId });
  if (!template) return sendError(res, 'Template not found', 404);

  const { fieldValues = {}, matterId, outputFormat = 'txt' } = req.body;
  let content = template.content;

  Object.entries(fieldValues).forEach(([key, value]) => {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  });

  template.usageCount = (template.usageCount || 0) + 1;
  template.lastUsedAt = new Date();
  await template.save();

  const generated = await GeneratedDocument.create({
    firmId,
    matterId:    matterId || undefined,
    templateId:  template._id,
    generatedBy: req.user._id,
    fieldValues,
    outputFormat,
    content,
    fileName:    `${template.name.replace(/\s+/g, '_')}_${Date.now()}.txt`,
  });

  sendSuccess(res, {
    _id:          generated._id,
    templateName: template.name,
    category:     template.category,
    content,
    outputFormat,
    generatedAt:  generated.generatedAt,
    fileName:     generated.fileName,
  }, 'Document generated');
};

/* ── AI Convert ─────────────────────────────────────────────────── */
exports.aiConvert = async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return sendError(res, 'Document content required', 400);
  if (!process.env.GEMINI_API_KEY) return sendError(res, 'AI service not configured', 503);

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are a legal document template converter. Analyze the document below and:
1. Identify all variable fields (names, dates, addresses, amounts, party names, case numbers, etc.)
2. Replace those fields with {{field_name}} placeholders using snake_case
3. Return ONLY a JSON object — no markdown, no explanation:

{
  "name": "Suggested template name",
  "category": "One of: NDA, Retainer Agreement, Engagement Letter, Demand Letter, Settlement Agreement, Lease, Employment Contract, Corporate Resolution, Court Motion, Pleading, Discovery, Custom",
  "description": "One sentence description",
  "content": "The document with {{placeholders}} inserted",
  "fields": [{"name": "field_name", "label": "Human Label", "type": "text"}]
}

Document:
${content.substring(0, 8000)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return sendError(res, 'AI could not parse document structure', 422);

  const parsed = JSON.parse(jsonMatch[0]);
  sendSuccess(res, parsed, 'Document converted to template');
};

/* ── Generated documents list ───────────────────────────────────── */
exports.listGeneratedDocs = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId, limit = 50, page = 1 } = req.query;
  const filter = { firmId };
  if (matterId) filter.matterId = matterId;

  const skip = (Number(page) - 1) * Number(limit);
  const docs = await GeneratedDocument.find(filter)
    .populate('templateId', 'name category')
    .populate('generatedBy', 'name')
    .sort({ createdAt: -1 })
    .skip(skip).limit(Number(limit)).lean();
  sendSuccess(res, docs, 'Generated documents fetched');
};

/* ── Court Forms ────────────────────────────────────────────────── */
exports.listCourtForms = async (req, res) => {
  const { state, court, category, q, limit = 50 } = req.query;
  const filter = { isActive: true };
  if (state)    filter.state    = new RegExp(state, 'i');
  if (court)    filter.court    = new RegExp(court, 'i');
  if (category) filter.category = new RegExp(category, 'i');
  if (q)        filter.$or = [{ formName: new RegExp(q, 'i') }, { formNumber: new RegExp(q, 'i') }];

  const forms = await CourtForm.find(filter).limit(Number(limit)).lean();
  sendSuccess(res, forms, 'Court forms fetched');
};

exports.fillCourtForm = async (req, res) => {
  const form = await CourtForm.findById(req.params.id).lean();
  if (!form) return sendError(res, 'Court form not found', 404);
  sendSuccess(res, { form, prefilledFields: req.query }, 'Court form data');
};
