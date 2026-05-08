const Annotation = require('../models/Annotation.model');
const Document   = require('../models/Document.model');
const { sendSuccess, sendError } = require('../utils/response');

async function assertDocAccess(docId) {
  const doc = await Document.findById(docId);
  return doc || null;
}

exports.getAnnotations = async (req, res, next) => {
  try {
    const doc = await assertDocAccess(req.params.docId);
    if (!doc) return sendError(res, 'Document not found', 404);

    const annotations = await Annotation.find({ documentId: req.params.docId })
      .sort({ clauseIndex: 1, createdAt: 1 });

    return sendSuccess(res, { annotations }, 'Annotations fetched');
  } catch (err) {
    next(err);
  }
};

exports.createAnnotation = async (req, res, next) => {
  try {
    const { clauseIndex, text, color, type, severity, clauseName } = req.body;

    if (clauseIndex === undefined || clauseIndex === null || !text?.trim()) {
      return sendError(res, 'clauseIndex and text are required', 400);
    }

    const doc = await assertDocAccess(req.params.docId);
    if (!doc) return sendError(res, 'Document not found', 404);

    const annotation = await Annotation.create({
      documentId:  req.params.docId,
      userId:      req.user._id,
      userName:    req.user.name,
      authorRole:  req.user.role || 'user',
      clauseIndex: Number(clauseIndex),
      clauseName:  clauseName || '',
      text:        text.trim(),
      color:       color || 'yellow',
      type:        type || 'annotation',
      severity:    severity || null,
    });

    const io = req.app.get('io');
    io.to(req.params.docId).emit('document-update', { type: 'annotation', annotation });

    return sendSuccess(res, { annotation }, 'Annotation created', 201);
  } catch (err) {
    next(err);
  }
};

exports.deleteAnnotation = async (req, res, next) => {
  try {
    const annotation = await Annotation.findOneAndDelete({
      _id:    req.params.aId,
      userId: req.user._id,
    });

    if (!annotation) return sendError(res, 'Annotation not found or not yours', 404);

    const io = req.app.get('io');
    io.to(String(annotation.documentId)).emit('document-update', {
      type:         'annotation-delete',
      annotationId: String(annotation._id),
    });

    return sendSuccess(res, null, 'Annotation deleted');
  } catch (err) {
    next(err);
  }
};

exports.resolveAnnotation = async (req, res, next) => {
  try {
    const annotation = await Annotation.findById(req.params.aId);
    if (!annotation) return sendError(res, 'Annotation not found', 404);

    // Toggle resolved state
    annotation.isResolved = !annotation.isResolved;
    annotation.resolvedAt = annotation.isResolved ? new Date() : null;
    annotation.resolvedBy = annotation.isResolved ? req.user._id : null;
    await annotation.save();

    const io = req.app.get('io');
    io.to(req.params.docId).emit('document-update', {
      type:         'annotation-resolve',
      annotationId: String(annotation._id),
      isResolved:   annotation.isResolved,
      resolvedBy:   req.user.name,
    });

    return sendSuccess(res, { annotation }, annotation.isResolved ? 'Resolved' : 'Unresolved');
  } catch (err) {
    next(err);
  }
};
