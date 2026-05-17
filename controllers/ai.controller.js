const AIAction       = require('../models/AIAction.model');
const AISuggestion   = require('../models/AISuggestion.model');
const AIConversation = require('../models/AIConversation.model');
const Matter         = require('../models/Matter.model');
const TimeEntry      = require('../models/TimeEntry.model');
const Task           = require('../models/Task.model');
const CommunicationLog = require('../models/CommunicationLog.model');
const CalendarEvent  = require('../models/CalendarEvent.model');
const claude         = require('../services/claude.service');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

/* ── Audit log helper ───────────────────────────────────────────── */
async function logAction(firmId, userId, action, input, result, error = null) {
  try {
    await AIAction.create({
      firmId, userId, action,
      input:      { text: String(input || '').slice(0, 500) },
      output:     result ? { summary: String(result.content || '').slice(0, 500) } : {},
      model:      result?.model || 'unknown',
      tokensUsed: result?.tokensUsed || 0,
      durationMs: result?.durationMs || 0,
      status:     error ? 'error' : 'success',
      error:      error ? String(error).slice(0, 500) : undefined,
    });
  } catch (e) {
    console.error('AI audit log failed:', e.message);
  }
}

/* ── Matter context builder ─────────────────────────────────────── */
async function buildMatterContext(matterId, firmId) {
  const [matter, timeEntries, tasks, comms] = await Promise.all([
    Matter.findOne({ _id: matterId, firmId }).populate('clientId','firstName lastName').lean(),
    TimeEntry.find({ firmId, matterId, isDeleted: { $ne: true } }).sort({ date: -1 }).limit(20).lean(),
    Task.find({ firmId, matterId, status: { $ne: 'completed' } }).sort({ dueDate: 1 }).limit(10).lean(),
    CommunicationLog.find({ firmId, matterId, isDeleted: { $ne: true } }).sort({ date: -1 }).limit(10).lean(),
  ]);

  if (!matter) return '';

  const clientName = matter.clientId
    ? `${matter.clientId.firstName||''} ${matter.clientId.lastName||''}`.trim()
    : 'Unknown Client';

  const teLines = timeEntries.map(e =>
    `- ${new Date(e.date).toDateString()}: ${e.hours}h (${e.activityType}) — "${e.description}" [${e.isBilled?'billed':'unbilled'}]`
  ).join('\n');

  const taskLines = tasks.map(t =>
    `- ${t.title} | due: ${t.dueDate ? new Date(t.dueDate).toDateString() : 'no due date'} | ${t.status} | ${t.priority} priority`
  ).join('\n');

  const commLines = comms.map(c =>
    `- ${new Date(c.date).toDateString()}: ${c.type} — "${c.subject||c.summary||''}" with ${c.contact||'unknown'}`
  ).join('\n');

  return `
MATTER: ${matter.title} (#${matter.matterNumber || 'N/A'})
Client: ${clientName}
Status: ${matter.status} | Stage: ${matter.stage}
Practice Area: ${matter.practiceArea}
Open Date: ${matter.openDate ? new Date(matter.openDate).toDateString() : 'unknown'}
Billing: ${matter.billingType} @ $${matter.hourlyRate||0}/hr

RECENT TIME ENTRIES (last 20):
${teLines || 'None'}

OPEN TASKS (next 10):
${taskLines || 'None'}

RECENT COMMUNICATIONS (last 10):
${commLines || 'None'}

NOTES:
${(matter.notes||[]).slice(0,3).map(n=>n.text).join('\n') || 'None'}
`.trim();
}

/* ── 1. Analyze Document ────────────────────────────────────────── */
exports.analyzeDocument = async (req, res) => {
  const { text, docId } = req.body;
  const firmId = getFirmId(req);
  let docText = text;

  if (!docText && docId) {
    const Document = require('../models/Document.model');
    const doc = await Document.findOne({ _id: docId, userId: req.user._id });
    if (!doc) return sendError(res, 'Document not found', 404);
    docText = doc.extractedText || '';
  }

  if (!docText || docText.trim().length < 50) {
    return sendError(res, 'Document text is required (minimum 50 characters)', 400);
  }

  let result;
  try {
    result = await claude.analyzeLegalDocument(docText);
  } catch (e) {
    await logAction(firmId, req.user._id, 'analyze_document', docText.slice(0, 200), null, e.message);
    return sendError(res, `AI analysis failed: ${e.message}`, 502);
  }

  await logAction(firmId, req.user._id, 'analyze_document', docText.slice(0, 200), result);
  sendSuccess(res, result, 'Document analyzed');
};

/* ── 2. Extract Deadlines ───────────────────────────────────────── */
exports.extractDeadlines = async (req, res) => {
  const { text, matterId, createEvents = false } = req.body;
  const firmId = getFirmId(req);

  if (!text || text.trim().length < 20) return sendError(res, 'Document text required', 400);

  let result;
  try {
    result = await claude.extractDeadlines(text);
  } catch (e) {
    await logAction(firmId, req.user._id, 'extract_deadlines', text.slice(0, 200), null, e.message);
    return sendError(res, `AI deadline extraction failed: ${e.message}`, 502);
  }

  await logAction(firmId, req.user._id, 'extract_deadlines', text.slice(0, 200), result);

  // Optionally create CalendarEvents
  let createdEvents = [];
  if (createEvents && matterId && (result.deadlines||[]).length > 0) {
    const validDeadlines = (result.deadlines || []).filter(d => d.date && d.confidence !== 'low');
    createdEvents = await Promise.all(
      validDeadlines.slice(0, 10).map(d =>
        CalendarEvent.create({
          firmId, matterId,
          createdBy:  req.user._id,
          assignedTo: [req.user._id],
          title:      d.description || d.type,
          eventType:  d.type === 'hearing' ? 'court_hearing' : 'deadline',
          startTime:  new Date(d.date),
          endTime:    new Date(d.date),
          allDay:     true,
          notes:      `Extracted by AI from uploaded document. Confidence: ${d.confidence}`,
        }).catch(() => null)
      )
    );
    createdEvents = createdEvents.filter(Boolean);

    // Save as suggestion too
    if (validDeadlines.length > 0) {
      await AISuggestion.create({
        firmId, userId: req.user._id, matterId,
        type: 'deadline',
        title: `${validDeadlines.length} deadline(s) extracted from document`,
        description: validDeadlines.map(d=>`${d.date}: ${d.description}`).join('; '),
        suggestedData: { deadlines: validDeadlines },
        status: 'accepted',
        acceptedAt: new Date(),
      });
    }
  }

  sendSuccess(res, { ...result, createdEvents }, 'Deadlines extracted');
};

/* ── 3. Suggest Invoice Draft ───────────────────────────────────── */
exports.suggestInvoiceDraft = async (req, res) => {
  const { matterId } = req.body;
  const firmId = getFirmId(req);

  if (!matterId) return sendError(res, 'matterId required', 400);

  const [matter, unbilledEntries] = await Promise.all([
    Matter.findOne({ _id: matterId, firmId }).lean(),
    TimeEntry.find({ firmId, matterId, isBillable: true, isBilled: false, isDeleted: { $ne: true } })
      .populate('userId','name').sort({ date: 1 }).lean(),
  ]);

  if (!matter) return sendError(res, 'Matter not found', 404);
  if (!unbilledEntries.length) return sendError(res, 'No unbilled time entries for this matter', 400);

  let result;
  try {
    result = await claude.reviewTimeEntries(unbilledEntries, matter.title);
  } catch (e) {
    await logAction(firmId, req.user._id, 'suggest_invoice', matterId, null, e.message);
    return sendError(res, `AI invoice review failed: ${e.message}`, 502);
  }

  await logAction(firmId, req.user._id, 'suggest_invoice', matterId, result);

  // Save flags as suggestions
  if ((result.flags||[]).some(f => f.severity === 'high' || f.severity === 'medium')) {
    await AISuggestion.create({
      firmId, userId: req.user._id, matterId,
      type: 'invoice_error',
      title: `${result.flags.length} issue(s) found in time entries for ${matter.title}`,
      description: result.summary,
      suggestedData: { flags: result.flags, cleanedDescriptions: result.cleanedDescriptions },
    });
  }

  sendSuccess(res, { matter: { title: matter.title, _id: matter._id }, entries: unbilledEntries, review: result }, 'Invoice draft review complete');
};

/* ── 4. Draft Document ──────────────────────────────────────────── */
exports.draftDocument = async (req, res) => {
  const { docType, facts, matterId } = req.body;
  const firmId = getFirmId(req);

  if (!docType || !facts) return sendError(res, 'docType and facts are required', 400);

  let matterContext = '';
  if (matterId) {
    matterContext = await buildMatterContext(matterId, firmId).catch(() => '');
  }

  let result;
  try {
    result = await claude.draftLegalDocument(docType, facts, matterContext);
  } catch (e) {
    await logAction(firmId, req.user._id, 'draft_document', `${docType}: ${facts.slice(0,100)}`, null, e.message);
    return sendError(res, `AI drafting failed: ${e.message}`, 502);
  }

  await logAction(firmId, req.user._id, 'draft_document', `${docType}: ${facts.slice(0,100)}`, result);

  await AISuggestion.create({
    firmId, userId: req.user._id, matterId: matterId || undefined,
    type: 'document_draft',
    title: `AI Draft: ${docType}`,
    description: `Generated ${docType} — ${facts.slice(0,100)}…`,
    suggestedData: { docType, content: result.content },
  });

  sendSuccess(res, { docType, content: result.content, tokensUsed: result.tokensUsed }, 'Document drafted');
};

/* ── 5. Matter Chat ─────────────────────────────────────────────── */
exports.matterChat = async (req, res) => {
  const { matterId, message, conversationId } = req.body;
  const firmId  = getFirmId(req);
  const userId  = req.user._id;

  if (!message) return sendError(res, 'message is required', 400);

  let conv;
  if (conversationId) {
    conv = await AIConversation.findOne({ _id: conversationId, firmId, userId });
  }
  if (!conv) {
    conv = await AIConversation.create({ firmId, userId, matterId: matterId || undefined, messages: [] });
  }

  // Build matter context
  let matterContext = 'No specific matter selected.';
  if (matterId) {
    matterContext = await buildMatterContext(matterId, firmId).catch(() => 'Matter context unavailable.');
  }

  // Append user message
  conv.messages.push({ role: 'user', content: message, timestamp: new Date() });

  // Build messages for Claude (last 20 turns to stay within context)
  const claudeMessages = conv.messages.slice(-20).map(m => ({
    role: m.role,
    content: m.content,
  }));

  let result;
  try {
    result = await claude.chatWithMatter(claudeMessages, matterContext);
  } catch (e) {
    await logAction(firmId, userId, 'matter_chat', message, null, e.message);
    return sendError(res, `AI chat failed: ${e.message}`, 502);
  }

  conv.messages.push({ role: 'assistant', content: result.content, timestamp: new Date() });
  await conv.save();

  await logAction(firmId, userId, 'matter_chat', message, result);

  sendSuccess(res, {
    conversationId: conv._id,
    reply: result.content,
    messages: conv.messages,
  }, 'Chat response');
};

/* ── 6. Suggestions ─────────────────────────────────────────────── */
exports.listSuggestions = async (req, res) => {
  const firmId = getFirmId(req);
  const { status = 'pending', matterId, type } = req.query;
  const filter = { firmId, userId: req.user._id };
  if (status)   filter.status   = status;
  if (matterId) filter.matterId = matterId;
  if (type)     filter.type     = type;

  const suggestions = await AISuggestion.find(filter)
    .sort({ createdAt: -1 }).limit(50)
    .populate('matterId', 'title matterNumber').lean();
  sendSuccess(res, suggestions, 'Suggestions fetched');
};

exports.acceptSuggestion = async (req, res) => {
  const sugg = await AISuggestion.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { status: 'accepted', acceptedAt: new Date() },
    { new: true }
  );
  if (!sugg) return sendError(res, 'Suggestion not found', 404);

  // Auto-create time entry if type === time_entry
  if (sugg.type === 'time_entry' && sugg.matterId) {
    try {
      const TimeEntry = require('../models/TimeEntry.model');
      const d = sugg.suggestedData;
      await TimeEntry.create({
        firmId: sugg.firmId,
        matterId: sugg.matterId,
        userId: sugg.userId,
        description: d.get?.('description') || sugg.description,
        hours: d.get?.('hours') || 0.25,
        rate:  d.get?.('rate')  || 0,
        date:  new Date(),
        activityType: 'admin',
        isBillable: true,
        source: 'ai_suggestion',
      });
    } catch (e) {
      console.error('Auto time entry creation failed:', e.message);
    }
  }

  sendSuccess(res, sugg, 'Suggestion accepted');
};

exports.dismissSuggestion = async (req, res) => {
  const sugg = await AISuggestion.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { status: 'dismissed', dismissedAt: new Date() },
    { new: true }
  );
  if (!sugg) return sendError(res, 'Suggestion not found', 404);
  sendSuccess(res, sugg, 'Suggestion dismissed');
};

/* ── 7. AI Audit Log ────────────────────────────────────────────── */
exports.getAIAuditLog = async (req, res) => {
  const { from, to, action, limit = 50, page = 1 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId };
  if (action) filter.action = action;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to)   filter.createdAt.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    AIAction.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    AIAction.countDocuments(filter),
  ]);

  sendSuccess(res, { logs, total, page: Number(page) }, 'AI audit log fetched');
};

/* ── 8. Narrate Report ──────────────────────────────────────────── */
exports.narrateReport = async (req, res) => {
  const { query, data } = req.body;
  const firmId = getFirmId(req);

  if (!query) return sendError(res, 'query is required', 400);

  let reportData = data;
  if (!reportData) {
    const reportsCtrl = require('./reports.controller');
    reportData = { message: 'Provide report data in the request body for narration.' };
  }

  let result;
  try {
    result = await claude.narrateReport(query, reportData);
  } catch (e) {
    await logAction(firmId, req.user._id, 'narrate_report', query, null, e.message);
    return sendError(res, `AI narration failed: ${e.message}`, 502);
  }

  await logAction(firmId, req.user._id, 'narrate_report', query, result);
  sendSuccess(res, { query, narrative: result.content, tokensUsed: result.tokensUsed }, 'Report narrated');
};

/* ── 9. Get Conversation History ────────────────────────────────── */
exports.getConversation = async (req, res) => {
  const conv = await AIConversation.findOne({ _id: req.params.id, firmId: getFirmId(req) }).lean();
  if (!conv) return sendError(res, 'Conversation not found', 404);
  sendSuccess(res, conv, 'Conversation fetched');
};

exports.listConversations = async (req, res) => {
  const { matterId } = req.query;
  const filter = { firmId: getFirmId(req), userId: req.user._id };
  if (matterId) filter.matterId = matterId;
  const convs = await AIConversation.find(filter).sort({ updatedAt: -1 }).limit(20)
    .populate('matterId','title matterNumber').lean();
  sendSuccess(res, convs, 'Conversations fetched');
};
