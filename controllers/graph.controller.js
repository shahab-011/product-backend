const Document = require('../models/Document.model');
const { extractGraphData } = require('../services/gemini.service');
const { sendSuccess, sendError } = require('../utils/response');

exports.getObligationWeb = async (req, res, next) => {
  try {
    const documents = await Document.find({
      userId:        req.user._id,
      status:        'analyzed',
      extractedText: { $exists: true, $ne: '' },
    })
      .select('_id originalName docType extractedText healthScore riskLevel')
      .sort({ uploadedAt: -1 })
      .limit(10);

    if (documents.length === 0) {
      return sendError(res, 'No analyzed documents found. Analyze at least one document first.', 404);
    }
    if (documents.length < 2) {
      return sendError(res, 'Analyze at least 2 documents to generate the Obligation Web.', 400);
    }

    const graphData = await extractGraphData(documents);

    // Normalize node types and severity so the frontend lookup maps always work
    const VALID_TYPES = new Set(['document', 'party', 'obligation', 'date', 'risk']);
    const VALID_SEV   = new Set(['critical', 'high', 'medium', 'low', null]);
    const VALID_REL   = new Set(['bound_by', 'involves', 'conflicts_with', 'references', 'due_by', 'owned_by', 'paid_by']);

    const enrichedNodes = (graphData.nodes || []).map(node => {
      const type = VALID_TYPES.has(node.type) ? node.type : 'obligation';
      const sev  = VALID_SEV.has((node.severity || '').toLowerCase())
        ? (node.severity || '').toLowerCase() || null
        : null;

      const enriched = { ...node, type, severity: sev };

      if (type === 'document' && node.documentId) {
        const doc = documents.find(d => d._id.toString() === String(node.documentId));
        if (doc) {
          enriched.healthScore = doc.healthScore;
          enriched.riskLevel   = doc.riskLevel;
          enriched.docType     = doc.docType;
        }
      }
      return enriched;
    });

    const enrichedEdges = (graphData.edges || []).map(edge => ({
      ...edge,
      relationship: VALID_REL.has(edge.relationship) ? edge.relationship : 'references',
      isConflict:   edge.isConflict === true || edge.relationship === 'conflicts_with',
    }));

    return sendSuccess(res, {
      nodes:         enrichedNodes,
      edges:         enrichedEdges,
      conflicts:     graphData.conflicts || [],
      summary:       graphData.summary   || '',
      documentCount: documents.length,
      documents:     documents.map(d => ({
        _id:         d._id,
        originalName:d.originalName,
        docType:     d.docType,
        healthScore: d.healthScore,
      })),
    }, 'Obligation Web generated successfully');
  } catch (err) {
    next(err);
  }
};
