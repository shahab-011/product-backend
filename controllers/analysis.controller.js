const Analysis = require('../models/Analysis.model');
const Document = require('../models/Document.model');
const ChatSession = require('../models/ChatSession.model');
const Alert = require('../models/Alert.model');
const { analyzeDocument, askQuestion, generateHealthScore } = require('../services/gemini.service');
const { runComplianceCheck } = require('../services/compliance.service');
const { sendSuccess, sendError } = require('../utils/response');

// Prefer state-specific > "India" > "Not specified". Returns the most informative result.
const GENERIC = new Set(['not specified', 'india', null, undefined, '']);
const pickJurisdiction = (ai, rule) => {
  const aiVal  = (ai   || '').trim();
  const ruleVal = (rule || '').trim();
  if (!GENERIC.has(aiVal.toLowerCase()))   return aiVal;   // Gemini found a state
  if (!GENERIC.has(ruleVal.toLowerCase())) return ruleVal; // Rule engine found a state
  if (aiVal)   return aiVal;                               // At least "India" from Gemini
  if (ruleVal) return ruleVal;                             // At least "India" from rules
  return 'Not specified';
};

exports.analyzeDoc = async (req, res, next) => {
  let doc;
  try {
    doc = await Document.findOne({ _id: req.params.docId, userId: req.user._id });
    if (!doc) return sendError(res, 'Document not found', 404);

    if (!doc.extractedText) return sendError(res, 'Document has no extracted text to analyze', 400);

    const rerun = req.query.rerun === 'true';
    const existing = await Analysis.findOne({ documentId: doc._id });
    if (existing && !rerun) {
      return sendSuccess(res, { analysis: existing }, 'Analysis already exists');
    }

    doc.status = 'processing';
    await doc.save({ validateBeforeSave: false });

    const [aiResult, complianceResult] = await Promise.all([
      analyzeDocument(doc.extractedText, doc.docType),
      Promise.resolve(runComplianceCheck(doc.extractedText)),
    ]);

    const finalHealth = generateHealthScore(
      aiResult.healthScore || 0,
      complianceResult.score || 0
    );

    const risks = aiResult.risks || [];
    const hasCritical = risks.some((r) => r.severity === 'high');
    const hasMedium = risks.some((r) => r.severity === 'medium');
    const riskLevel = hasCritical ? 'high' : hasMedium ? 'medium' : 'low';

    const analysisData = {
      documentId: doc._id,
      userId: req.user._id,
      summary: aiResult.summary,
      clauses: aiResult.clauses || [],
      risks,
      compliance: {
        score: complianceResult.score,
        mandatoryClauses: complianceResult.mandatoryClauses,
        missingClauses: complianceResult.missingClauses,
        signaturePresent: complianceResult.signaturePresent,
        datesValid: complianceResult.datesValid,
        jurisdictionValid: complianceResult.jurisdictionValid,
        jurisdictionDetected: complianceResult.jurisdictionDetected,
      },
      healthScore: finalHealth,
      confidenceScore: aiResult.confidenceScore || 0,
      detectedDocType: aiResult.detectedDocType || doc.docType,
      detectedJurisdiction: pickJurisdiction(aiResult.detectedJurisdiction, complianceResult.jurisdictionDetected),
      expiryDate: aiResult.expiryDate ? new Date(aiResult.expiryDate) : undefined,
      renewalDate: aiResult.renewalDate ? new Date(aiResult.renewalDate) : undefined,
      analyzedAt: new Date(),
    };

    const analysis = existing
      ? await Analysis.findOneAndUpdate({ documentId: doc._id }, analysisData, { new: true, upsert: true })
      : await Analysis.create(analysisData);

    doc.healthScore = finalHealth;
    doc.riskLevel = riskLevel;
    doc.riskCount = risks.length;
    doc.status = 'analyzed';
    doc.jurisdiction = analysisData.detectedJurisdiction;
    if (aiResult.expiryDate) doc.expiryDate = new Date(aiResult.expiryDate);
    if (aiResult.renewalDate) doc.renewalDate = new Date(aiResult.renewalDate);
    await doc.save({ validateBeforeSave: false });

    // Create a risk alert for high-risk documents (skip if already alerted in last 24h)
    if (riskLevel === 'high') {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentAlert = await Alert.findOne({
        userId: req.user._id,
        documentId: doc._id,
        alertType: 'risk',
        createdAt: { $gte: oneDayAgo },
      });
      if (!recentAlert) {
        const topRisk = risks.find((r) => r.severity === 'high');
        await Alert.create({
          userId: req.user._id,
          documentId: doc._id,
          alertType: 'risk',
          title: `High Risk Detected — ${doc.originalName}`,
          message: topRisk
            ? `${topRisk.title}: ${topRisk.description}`
            : `This document scored ${finalHealth}/100 and contains high-severity risks. Review immediately.`,
          severity: 'high',
        });
      }
    }

    return sendSuccess(res, { analysis }, 'Document analyzed successfully');
  } catch (err) {
    if (doc) {
      doc.status = 'error';
      await doc.save({ validateBeforeSave: false }).catch(() => {});
    }
    next(err);
  }
};

exports.getAnalysis = async (req, res, next) => {
  try {
    const analysis = await Analysis.findOne({
      documentId: req.params.docId,
      userId: req.user._id,
    }).populate('documentId', 'originalName docType fileType');

    if (!analysis) return sendError(res, 'Analysis not found', 404);

    return sendSuccess(res, { analysis }, 'Analysis fetched');
  } catch (err) {
    next(err);
  }
};

exports.askAI = async (req, res, next) => {
  try {
    const { question } = req.body;
    const { docId } = req.params;

    if (!question || !question.trim()) {
      return sendError(res, 'Question is required', 400);
    }

    const doc = await Document.findOne({ _id: docId, userId: req.user._id }).select('+extractedText');
    if (!doc) return sendError(res, 'Document not found', 404);
    if (!doc.extractedText) return sendError(res, 'Document has no text content to query', 400);

    const session = await ChatSession.findOneAndUpdate(
      { documentId: docId, userId: req.user._id },
      { $setOnInsert: { documentId: docId, userId: req.user._id, messages: [], messageCount: 0 } },
      { upsert: true, new: true }
    );

    const answer = await askQuestion(question, doc.extractedText, session.messages);

    const now = new Date();
    session.messages.push({ role: 'user',      content: question, timestamp: now });
    session.messages.push({ role: 'assistant', content: answer,   timestamp: now });

    // Trim oldest 10 messages when the cap is exceeded — batch trim keeps writes efficient
    if (session.messages.length > 50) {
      session.messages.splice(0, 10);
    }

    session.messageCount = session.messages.length;
    session.lastMessageAt = new Date();
    await session.save();

    return sendSuccess(res, { answer, messageCount: session.messageCount }, 'Answer generated');
  } catch (err) {
    next(err);
  }
};

exports.getChatHistory = async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({
      documentId: req.params.docId,
      userId: req.user._id,
    });

    if (!session) {
      return sendSuccess(res, { messages: [], messageCount: 0 }, 'No chat history');
    }

    return sendSuccess(res, { messages: session.messages, messageCount: session.messageCount }, 'Chat history fetched');
  } catch (err) {
    next(err);
  }
};

exports.clearChatHistory = async (req, res, next) => {
  try {
    await ChatSession.findOneAndUpdate(
      { documentId: req.params.docId, userId: req.user._id },
      { messages: [], messageCount: 0, lastMessageAt: null },
      { new: true }
    );

    return sendSuccess(res, null, 'Chat history cleared');
  } catch (err) {
    next(err);
  }
};
