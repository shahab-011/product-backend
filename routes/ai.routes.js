const router = require('express').Router();
const ctrl   = require('../controllers/ai.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth  = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];
const admin = [protect, authorize('owner', 'admin')];

// ── Document intelligence ────────────────────────────────────────────
router.post('/analyze-document',  ...auth, ctrl.analyzeDocument);
router.post('/extract-deadlines', ...auth, ctrl.extractDeadlines);

// ── Invoice & drafting ───────────────────────────────────────────────
router.post('/suggest-invoice', ...auth, ctrl.suggestInvoiceDraft);
router.post('/draft-document',  ...auth, ctrl.draftDocument);

// ── Conversational AI ────────────────────────────────────────────────
router.post('/chat', ...auth, ctrl.matterChat);

// ── Report narration ─────────────────────────────────────────────────
router.post('/narrate-report', ...auth, ctrl.narrateReport);

// ── Suggestions (static before /:id) ────────────────────────────────
router.get('/suggestions',               ...auth, ctrl.listSuggestions);
router.patch('/suggestions/:id/accept',  ...auth, ctrl.acceptSuggestion);
router.patch('/suggestions/:id/dismiss', ...auth, ctrl.dismissSuggestion);

// ── Conversations ────────────────────────────────────────────────────
router.get('/conversations',     ...auth, ctrl.listConversations);
router.get('/conversations/:id', ...auth, ctrl.getConversation);

// ── Audit log (admin only) ───────────────────────────────────────────
router.get('/audit-log', ...admin, ctrl.getAIAuditLog);

module.exports = router;
