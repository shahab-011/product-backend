const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { getAlerts, markAsRead, markAllRead, deleteAlert } = require('../controllers/alert.controller');

router.get('/', protect, getAlerts);
router.patch('/read-all', protect, markAllRead);
router.patch('/:id/read', protect, markAsRead);
router.delete('/:id', protect, deleteAlert);

module.exports = router;
