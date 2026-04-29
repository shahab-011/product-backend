const path = require('path');
const Document = require('../models/Document.model');
const Analysis = require('../models/Analysis.model');
const ChatSession = require('../models/ChatSession.model');
const Comparison = require('../models/Comparison.model');
const { extractText } = require('../utils/extractor');
const { sendSuccess, sendError } = require('../utils/response');

const ALLOWED_FILE_TYPES = ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp', 'other'];

const resolveFileType = (originalname) => {
  const ext = path.extname(originalname).toLowerCase().replace('.', '');
  return ALLOWED_FILE_TYPES.includes(ext) ? ext : 'other';
};

const safeDoc = (doc) => {
  const obj = doc.toObject();
  delete obj.extractedText;
  return obj;
};

exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }

    const { docType, isPrivate, jurisdiction } = req.body;
    const { originalname, buffer, mimetype, size } = req.file;

    const { text, pages } = await extractText(buffer, originalname, mimetype);

    const document = await Document.create({
      userId: req.user._id,
      originalName: originalname,
      storedName: originalname,
      fileType: resolveFileType(originalname),
      docType: docType || 'Other',
      fileSizeBytes: size,
      pageCount: pages,
      extractedText: text,
      jurisdiction: jurisdiction || 'Not detected',
      isPrivate: isPrivate === 'true' || isPrivate === true,
      status: 'uploaded',
    });

    return sendSuccess(res, { document: safeDoc(document) }, 'Document uploaded successfully', 201);
  } catch (err) {
    next(err);
  }
};

exports.uploadTextOnly = async (req, res, next) => {
  try {
    const { extractedText, originalName, docType, jurisdiction, isPrivate } = req.body;

    if (!extractedText || !originalName) {
      return sendError(res, 'extractedText and originalName are required', 400);
    }

    const document = await Document.create({
      userId: req.user._id,
      originalName,
      storedName: originalName,
      fileType: resolveFileType(originalName),
      docType: docType || 'Other',
      jurisdiction: jurisdiction || 'Not detected',
      extractedText,
      isPrivate: isPrivate === false ? false : true,
      status: 'uploaded',
    });

    return sendSuccess(res, { document: safeDoc(document) }, 'Document saved successfully', 201);
  } catch (err) {
    next(err);
  }
};

exports.getDocuments = async (req, res, next) => {
  try {
    const documents = await Document.find({ userId: req.user._id })
      .select('-extractedText')
      .sort({ uploadedAt: -1 });

    return sendSuccess(res, { documents, total: documents.length }, 'Documents fetched');
  } catch (err) {
    next(err);
  }
};

exports.getDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) {
      return sendError(res, 'Document not found', 404);
    }

    return sendSuccess(res, { document }, 'Document fetched');
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) {
      return sendError(res, 'Document not found', 404);
    }

    await Promise.all([
      Analysis.deleteMany({ documentId: req.params.id }),
      ChatSession.deleteMany({ documentId: req.params.id }),
      Comparison.deleteMany({ $or: [{ docAId: req.params.id }, { docBId: req.params.id }] }),
    ]);
    await document.deleteOne();

    return sendSuccess(res, null, 'Document deleted successfully');
  } catch (err) {
    next(err);
  }
};

exports.getTextPreview = async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return sendError(res, 'Document not found', 404);

    const text      = document.extractedText || '';
    const preview   = text.slice(0, 300).trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return sendSuccess(res, { preview, charCount: text.length, wordCount }, 'Preview fetched');
  } catch (err) {
    next(err);
  }
};

exports.updateDocument = async (req, res, next) => {
  try {
    const { docType, isPrivate, jurisdiction, expiryDate, renewalDate } = req.body;

    const document = await Document.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { docType, isPrivate, jurisdiction, expiryDate, renewalDate },
      { new: true, runValidators: true }
    ).select('-extractedText');

    if (!document) {
      return sendError(res, 'Document not found', 404);
    }

    return sendSuccess(res, { document }, 'Document updated successfully');
  } catch (err) {
    next(err);
  }
};
