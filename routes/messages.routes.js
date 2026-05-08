const express = require('express');
const router  = express.Router();
const DirectMessage = require('../models/DirectMessage.model');
const ClientLink    = require('../models/ClientLink.model');
const { protect }   = require('../middleware/auth.middleware');
const { sendSuccess, sendError } = require('../utils/response');

// Verify the requesting user belongs to this link (as lawyer or client)
async function assertLinkAccess(userId, linkId, res) {
  const link = await ClientLink.findById(linkId).lean();
  if (!link) { sendError(res, 'Link not found', 404); return null; }

  const uid = String(userId);
  if (String(link.lawyerId) !== uid && String(link.clientId) !== uid) {
    sendError(res, 'Forbidden', 403);
    return null;
  }
  return link;
}

// GET /api/messages/:linkId?before=<ISO>&limit=<n>
// Returns the last N messages (newest-last for chat display)
router.get('/:linkId', protect, async (req, res, next) => {
  try {
    const link = await assertLinkAccess(req.user._id, req.params.linkId, res);
    if (!link) return;

    const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const filter = { linkId: req.params.linkId };
    if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

    const messages = await DirectMessage
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Mark unread messages sent by the OTHER user as read
    await DirectMessage.updateMany(
      { linkId: req.params.linkId, senderId: { $ne: req.user._id }, read: false },
      { read: true }
    );

    return sendSuccess(res, { messages: messages.reverse() });
  } catch (err) { next(err); }
});

// POST /api/messages/:linkId
// Send a message. Persists to DB then broadcasts via socket.
router.post('/:linkId', protect, async (req, res, next) => {
  try {
    const link = await assertLinkAccess(req.user._id, req.params.linkId, res);
    if (!link) return;

    const { text } = req.body;
    if (!text || !text.trim()) return sendError(res, 'Message text is required', 400);

    const role = String(link.lawyerId) === String(req.user._id) ? 'lawyer' : 'client';

    const msg = await DirectMessage.create({
      linkId:     req.params.linkId,
      senderId:   req.user._id,
      senderName: req.user.name || req.user.email,
      senderRole: role,
      text:       text.trim(),
    });

    // Broadcast to the room so the other party sees it instantly
    const io = req.app.get('io');
    io.to(`msg_${req.params.linkId}`).emit('direct-message', msg);

    return sendSuccess(res, { message: msg }, 'Message sent', 201);
  } catch (err) { next(err); }
});

module.exports = router;
