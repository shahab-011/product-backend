const Comparison = require('../models/Comparison.model');
const Document = require('../models/Document.model');
const { compareDocuments } = require('../services/gemini.service');
const { sendSuccess, sendError } = require('../utils/response');

exports.compare = async (req, res, next) => {
  try {
    const { docAId, docBId } = req.body;

    if (!docAId || !docBId) {
      return sendError(res, 'Both docAId and docBId are required', 400);
    }
    if (docAId === docBId) {
      return sendError(res, 'Cannot compare a document with itself', 400);
    }

    const [docA, docB] = await Promise.all([
      Document.findOne({ _id: docAId, userId: req.user._id }),
      Document.findOne({ _id: docBId, userId: req.user._id }),
    ]);

    if (!docA) return sendError(res, 'Document A not found or access denied', 404);
    if (!docB) return sendError(res, 'Document B not found or access denied', 404);

    if (!docA.extractedText) return sendError(res, 'Document A has no extracted text', 400);
    if (!docB.extractedText) return sendError(res, 'Document B has no extracted text', 400);

    const result = await compareDocuments(docA.extractedText, docB.extractedText);

    const comparison = await Comparison.create({
      userId: req.user._id,
      docAId,
      docBId,
      summary: result.summary,
      additions: result.additions || [],
      removals: result.removals || [],
      modifications: result.modifications || [],
      riskChange: result.riskChange || 'neutral',
      recommendation: result.recommendation,
    });

    return sendSuccess(res, { comparison }, 'Comparison completed', 201);
  } catch (err) {
    next(err);
  }
};

exports.getComparisons = async (req, res, next) => {
  try {
    const comparisons = await Comparison.find({ userId: req.user._id })
      .populate('docAId', 'originalName')
      .populate('docBId', 'originalName')
      .sort({ createdAt: -1 });

    return sendSuccess(res, { comparisons, total: comparisons.length }, 'Comparisons fetched');
  } catch (err) {
    next(err);
  }
};

exports.getComparison = async (req, res, next) => {
  try {
    const comparison = await Comparison.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('docAId', 'originalName')
      .populate('docBId', 'originalName');

    if (!comparison) return sendError(res, 'Comparison not found', 404);

    return sendSuccess(res, { comparison }, 'Comparison fetched');
  } catch (err) {
    next(err);
  }
};
