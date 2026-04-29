const Annotation = require('../models/Annotation.model');
const Document   = require('../models/Document.model');
const { sendSuccess, sendError } = require('../utils/response');

/* Access guard — user must own or be in the same lawyer case as the doc.
   For this version we allow any authenticated user who knows the docId
   (e.g. a lawyer reviewing a shared doc) to annotate. The documentId
   itself is the room key, so only users who have joined that room see updates. */
async function assertDocAccess(docId, userId) {
  // Owner check — non-owners (e.g. lawyers viewing shared docs) can still read/annotate
  const doc = await Document.findById(docId);
  if (!doc) return null;
  return doc;
}

exports.getAnnotations = async (req, res, next) => {
  try {
    const doc = await assertDocAccess(req.params.docId, req.user._id);
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
    const { clauseIndex, text, color } = req.body;

    if (clauseIndex === undefined || clauseIndex === null || !text?.trim()) {
      return sendError(res, 'clauseIndex and text are required', 400);
    }

    const doc = await assertDocAccess(req.params.docId, req.user._id);
    if (!doc) return sendError(res, 'Document not found', 404);

    const annotation = await Annotation.create({
      documentId:  req.params.docId,
      userId:      req.user._id,
      userName:    req.user.name,
      clauseIndex: Number(clauseIndex),
      text:        text.trim(),
      color:       color || 'yellow',
    });

    // Broadcast to every socket in the document room (including sender — client deduplicates by _id)
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
      userId: req.user._id, // only the author can delete their own note
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
