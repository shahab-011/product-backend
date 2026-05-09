const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  analyzeDoc,
  getAnalysis,
  askAI,
  getChatHistory,
  clearChatHistory,
  runSilenceDetector,
} = require('../controllers/analysis.controller');

router.post('/:docId/analyze',  protect, analyzeDoc);
router.post('/:docId/silence',  protect, runSilenceDetector);
router.post('/:docId/chat',     protect, askAI);
router.get('/:docId/chat-history',    protect, getChatHistory);
router.delete('/:docId/chat-history', protect, clearChatHistory);
router.get('/:docId', protect, getAnalysis);

module.exports = router;
