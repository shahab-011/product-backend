const express = require('express');
const router  = express.Router();
const CollaborationSession = require('../models/CollaborationSession.model');
const { protect } = require('../middleware/auth.middleware');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/collaboration/:docId/collaborators
// Returns everyone currently online in a document room
router.get('/:docId/collaborators', protect, async (req, res, next) => {
  try {
    const sessions = await CollaborationSession.find({
      documentId: req.params.docId,
      isOnline:   true,
    }).select('userId userName userRole lastSeen currentClause');

    return sendSuccess(res, { collaborators: sessions, count: sessions.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/collaboration/:docId/presence
// Update which clause the user is currently reading
router.post('/:docId/presence', protect, async (req, res, next) => {
  try {
    const { currentClause } = req.body;

    await CollaborationSession.findOneAndUpdate(
      { documentId: req.params.docId, userId: req.user._id },
      { currentClause: currentClause ?? null, lastSeen: new Date() },
      { upsert: true, new: true }
    );

    const io = req.app.get('io');
    io.to(req.params.docId).emit('cursor-move', {
      userId:        String(req.user._id),
      userName:      req.user.name,
      clauseIndex:   currentClause,
    });

    return sendSuccess(res, null, 'Presence updated');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
