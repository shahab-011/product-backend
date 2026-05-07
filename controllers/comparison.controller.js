const Comparison = require('../models/Comparison.model');
const Document   = require('../models/Document.model');
const { compareDocuments } = require('../services/gemini.service');
const { sendSuccess, sendError } = require('../utils/response');

/* ── POST /api/comparisons ─────────────────────────────────────────── */
exports.compare = async (req, res, next) => {
  try {
    const { docAId, docBId } = req.body;

    if (!docAId || !docBId) {
      return sendError(res, 'Please provide both document IDs to compare', 400);
    }

    if (docAId.toString() === docBId.toString()) {
      return sendError(res, 'Please select two different documents to compare', 400);
    }

    const [docA, docB] = await Promise.all([
      Document.findOne({ _id: docAId, userId: req.user._id }),
      Document.findOne({ _id: docBId, userId: req.user._id }),
    ]);

    if (!docA) {
      return sendError(res, 'Document A not found or you do not have access to it', 404);
    }
    if (!docB) {
      return sendError(res, 'Document B not found or you do not have access to it', 404);
    }

    if (!docA.extractedText || !docA.extractedText.trim()) {
      return sendError(res, 'Document A has no readable text. Please re-upload it.', 400);
    }
    if (!docB.extractedText || !docB.extractedText.trim()) {
      return sendError(res, 'Document B has no readable text. Please re-upload it.', 400);
    }

    console.log('Starting comparison between:', docA.originalName, 'and', docB.originalName);

    const result = await compareDocuments(docA.extractedText, docB.extractedText);

    if (result.error) {
      return sendError(res, result.errorMessage || 'AI comparison failed. Please try again.', 500);
    }

    const comparison = await Comparison.create({
      userId:        req.user._id,
      docAId,
      docBId,
      summary:       result.summary       || '',
      additions:     result.additions     || [],
      removals:      result.removals      || [],
      modifications: result.modifications || [],
      riskChange:    result.riskChange    || 'neutral',
      recommendation: result.recommendation || '',
    });

    console.log('Comparison saved with id:', comparison._id);

    return sendSuccess(
      res,
      {
        comparison,
        docAName: docA.originalName,
        docBName: docB.originalName,
      },
      'Comparison complete',
      201
    );
  } catch (err) {
    next(err);
  }
};

/* ── GET /api/comparisons ──────────────────────────────────────────── */
exports.getComparisons = async (req, res, next) => {
  try {
    const comparisons = await Comparison.find({ userId: req.user._id })
      .populate('docAId', 'originalName docType uploadedAt fileType')
      .populate('docBId', 'originalName docType uploadedAt fileType')
      .sort({ createdAt: -1 });

    return sendSuccess(
      res,
      { comparisons, total: comparisons.length },
      'Comparisons fetched successfully'
    );
  } catch (err) {
    next(err);
  }
};

/* ── GET /api/comparisons/:id ──────────────────────────────────────── */
exports.getComparison = async (req, res, next) => {
  try {
    const comparison = await Comparison.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })
      .populate('docAId', 'originalName docType uploadedAt fileType')
      .populate('docBId', 'originalName docType uploadedAt fileType');

    if (!comparison) {
      return sendError(res, 'Comparison not found', 404);
    }

    return sendSuccess(res, { comparison }, 'Comparison fetched successfully');
  } catch (err) {
    next(err);
  }
};

/* ── DELETE /api/comparisons/:id ───────────────────────────────────── */
exports.deleteComparison = async (req, res, next) => {
  try {
    const comparison = await Comparison.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!comparison) {
      return sendError(res, 'Comparison not found', 404);
    }

    return sendSuccess(res, {}, 'Comparison deleted successfully');
  } catch (err) {
    next(err);
  }
};
