const crypto          = require('crypto');
const PracticeDocument = require('../models/PracticeDocument.model');
const DocumentFolder   = require('../models/DocumentFolder.model');
const DocumentRequest  = require('../models/DocumentRequest.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const POPULATE_DOC = [
  { path: 'uploadedBy', select: 'name email' },
  { path: 'matterId',   select: 'title matterNumber' },
  { path: 'folderId',   select: 'name' },
];

/* ── Documents ────────────────────────────────────────────────────── */

exports.listDocuments = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId, folderId, mimeType, tags, q, limit = 100, page = 1 } = req.query;

  const filter = { firmId, isDeleted: { $ne: true } };
  if (matterId)  filter.matterId  = matterId;
  if (folderId)  filter.folderId  = folderId;
  if (mimeType)  filter.mimeType  = new RegExp(mimeType, 'i');
  if (tags)      filter.tags      = { $in: Array.isArray(tags) ? tags : [tags] };
  if (q)         filter.$or = [{ name: new RegExp(q, 'i') }, { tags: new RegExp(q, 'i') }, { description: new RegExp(q, 'i') }];

  const skip = (Number(page) - 1) * Number(limit);
  const [docs, total] = await Promise.all([
    PracticeDocument.find(filter)
      .populate(POPULATE_DOC)
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    PracticeDocument.countDocuments(filter),
  ]);
  sendSuccess(res, { docs, total, page: Number(page) }, 'Documents fetched');
};

exports.getDocument = async (req, res) => {
  const firmId = getFirmId(req);
  const doc = await PracticeDocument.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } })
    .populate(POPULATE_DOC).lean();
  if (!doc) return sendError(res, 'Document not found', 404);
  sendSuccess(res, doc, 'Document fetched');
};

exports.uploadDocument = async (req, res) => {
  const firmId = getFirmId(req);
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const { matterId, folderId, description, tags, isClientVisible } = req.body;
  const { originalname, mimetype, size } = req.file;

  const s3Key = `${firmId}/${Date.now()}-${originalname.replace(/\s+/g, '_')}`;

  const doc = await PracticeDocument.create({
    firmId,
    matterId:        matterId || undefined,
    folderId:        folderId || undefined,
    uploadedBy:      req.user._id,
    name:            originalname,
    originalName:    originalname,
    mimeType:        mimetype,
    size,
    s3Key,
    description:     description || '',
    tags:            tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
    isClientVisible: isClientVisible === 'true' || isClientVisible === true,
    currentVersion:  1,
    versions:        [{ versionNumber: 1, s3Key, size, uploadedBy: req.user._id }],
  });

  const populated = await PracticeDocument.findById(doc._id).populate(POPULATE_DOC).lean();
  sendSuccess(res, populated, 'Document uploaded', 201);
};

exports.updateDocument = async (req, res) => {
  const firmId = getFirmId(req);
  const { name, description, tags, permissions, isClientVisible, folderId } = req.body;
  const doc = await PracticeDocument.findOneAndUpdate(
    { _id: req.params.id, firmId, isDeleted: { $ne: true } },
    { name, description, tags, permissions, isClientVisible, folderId },
    { new: true, runValidators: true }
  ).populate(POPULATE_DOC);
  if (!doc) return sendError(res, 'Document not found', 404);
  sendSuccess(res, doc, 'Document updated');
};

exports.softDeleteDocument = async (req, res) => {
  const firmId = getFirmId(req);
  const doc = await PracticeDocument.findOneAndUpdate(
    { _id: req.params.id, firmId }, { isDeleted: true }, { new: true }
  );
  if (!doc) return sendError(res, 'Document not found', 404);
  sendSuccess(res, null, 'Document deleted');
};

exports.downloadDocument = async (req, res) => {
  const firmId = getFirmId(req);
  const doc = await PracticeDocument.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } }).lean();
  if (!doc) return sendError(res, 'Document not found', 404);
  // In production: generate presigned S3 URL. For demo: return metadata.
  sendSuccess(res, { downloadUrl: doc.cdnUrl || null, s3Key: doc.s3Key, name: doc.name }, 'Download info');
};

exports.getPreviewUrl = async (req, res) => {
  const firmId = getFirmId(req);
  const doc = await PracticeDocument.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } }).lean();
  if (!doc) return sendError(res, 'Document not found', 404);
  sendSuccess(res, { previewUrl: doc.cdnUrl || null, mimeType: doc.mimeType, name: doc.name }, 'Preview URL');
};

exports.uploadNewVersion = async (req, res) => {
  const firmId = getFirmId(req);
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const doc = await PracticeDocument.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } });
  if (!doc) return sendError(res, 'Document not found', 404);

  const { size, originalname } = req.file;
  const newVersion = (doc.currentVersion || 1) + 1;
  const s3Key = `${firmId}/${Date.now()}-v${newVersion}-${originalname.replace(/\s+/g, '_')}`;

  doc.versions.push({ versionNumber: newVersion, s3Key, size, uploadedBy: req.user._id, notes: req.body.notes });
  doc.currentVersion = newVersion;
  doc.size = size;
  doc.s3Key = s3Key;
  await doc.save();

  const populated = await PracticeDocument.findById(doc._id).populate(POPULATE_DOC).lean();
  sendSuccess(res, populated, `Version ${newVersion} uploaded`);
};

exports.listVersions = async (req, res) => {
  const firmId = getFirmId(req);
  const doc = await PracticeDocument.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } })
    .populate('versions.uploadedBy', 'name').lean();
  if (!doc) return sendError(res, 'Document not found', 404);
  sendSuccess(res, doc.versions, 'Versions fetched');
};

exports.restoreVersion = async (req, res) => {
  const firmId = getFirmId(req);
  const doc = await PracticeDocument.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } });
  if (!doc) return sendError(res, 'Document not found', 404);

  const version = doc.versions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);

  doc.currentVersion = version.versionNumber;
  doc.s3Key = version.s3Key;
  doc.size   = version.size;
  await doc.save();

  sendSuccess(res, doc, `Restored to version ${version.versionNumber}`);
};

exports.createShareLink = async (req, res) => {
  const firmId = getFirmId(req);
  const { expiresInHours = 24 } = req.body;

  const doc = await PracticeDocument.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } });
  if (!doc) return sendError(res, 'Document not found', 404);

  doc.shareToken     = crypto.randomBytes(24).toString('hex');
  doc.shareExpiresAt = new Date(Date.now() + expiresInHours * 3600000);
  await doc.save();

  const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shared-doc/${doc.shareToken}`;
  sendSuccess(res, { shareUrl, expiresAt: doc.shareExpiresAt }, 'Share link created');
};

exports.bulkMoveDocuments = async (req, res) => {
  const firmId = getFirmId(req);
  const { documentIds, folderId } = req.body;
  if (!Array.isArray(documentIds) || !documentIds.length) return sendError(res, 'documentIds required', 400);

  await PracticeDocument.updateMany(
    { _id: { $in: documentIds }, firmId },
    { folderId: folderId || null }
  );
  sendSuccess(res, null, 'Documents moved');
};

exports.importFromCloud = async (req, res) => {
  sendError(res, 'Cloud import requires OAuth setup — configure Google/Dropbox credentials in .env', 501);
};

/* ── Folders ──────────────────────────────────────────────────────── */

exports.listFolders = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId } = req.query;
  const filter = { firmId };
  if (matterId) filter.matterId = matterId;

  let folders = await DocumentFolder.find(filter).sort({ order: 1, name: 1 }).lean();

  if (matterId && folders.length === 0) {
    // Auto-create default folder structure for this matter
    const defaults = DocumentFolder.statics?.DEFAULT_FOLDERS ||
      ['Pleadings','Correspondence','Evidence','Contracts','Forms','Discovery','Other'];
    const created = await DocumentFolder.insertMany(
      defaults.map((name, order) => ({ firmId, matterId, name, order, isDefault: true, createdBy: req.user._id }))
    );
    folders = created.map(f => f.toObject());
  }

  sendSuccess(res, folders, 'Folders fetched');
};

exports.createFolder = async (req, res) => {
  const firmId = getFirmId(req);
  const folder = await DocumentFolder.create({ ...req.body, firmId, createdBy: req.user._id });
  sendSuccess(res, folder, 'Folder created', 201);
};

exports.renameFolder = async (req, res) => {
  const firmId = getFirmId(req);
  const folder = await DocumentFolder.findOneAndUpdate(
    { _id: req.params.id, firmId },
    { name: req.body.name },
    { new: true }
  );
  if (!folder) return sendError(res, 'Folder not found', 404);
  sendSuccess(res, folder, 'Folder renamed');
};

exports.deleteFolder = async (req, res) => {
  const firmId = getFirmId(req);
  const folder = await DocumentFolder.findOneAndDelete({ _id: req.params.id, firmId });
  if (!folder) return sendError(res, 'Folder not found', 404);
  // Move documents in this folder to parent or root
  await PracticeDocument.updateMany(
    { folderId: folder._id, firmId },
    { folderId: folder.parentId || null }
  );
  sendSuccess(res, null, 'Folder deleted');
};

/* ── Document Requests ───────────────────────────────────────────── */

exports.listRequests = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId, status } = req.query;
  const filter = { firmId };
  if (matterId) filter.matterId = matterId;
  if (status)   filter.status   = status;

  const requests = await DocumentRequest.find(filter)
    .populate('requestedBy', 'name')
    .populate('matterId', 'title matterNumber')
    .populate('clientId', 'firstName lastName email')
    .sort({ createdAt: -1 }).lean();
  sendSuccess(res, requests, 'Requests fetched');
};

exports.createRequest = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await DocumentRequest.create({ ...req.body, firmId, requestedBy: req.user._id });
  sendSuccess(res, request, 'Document request created', 201);
};

exports.fulfilRequest = async (req, res) => {
  const firmId = getFirmId(req);
  const { documentId } = req.body;
  const request = await DocumentRequest.findOneAndUpdate(
    { _id: req.params.id, firmId },
    { status: 'fulfilled', fulfilledDocumentId: documentId, fulfilledAt: new Date() },
    { new: true }
  );
  if (!request) return sendError(res, 'Request not found', 404);
  sendSuccess(res, request, 'Request fulfilled');
};

/* ── Public share endpoint ───────────────────────────────────────── */

exports.getSharedDocument = async (req, res) => {
  const doc = await PracticeDocument.findOne({
    shareToken:     req.params.token,
    shareExpiresAt: { $gt: new Date() },
    isDeleted:      { $ne: true },
  }).select('-textContent').lean();
  if (!doc) return sendError(res, 'Share link not found or expired', 404);
  sendSuccess(res, doc, 'Shared document');
};
