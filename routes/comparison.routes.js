const express = require('express');
const router  = express.Router();
const {
  compare,
  getComparisons,
  getComparison,
  deleteComparison,
} = require('../controllers/comparison.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/',     protect, compare);
router.get('/',      protect, getComparisons);
router.get('/:id',   protect, getComparison);
router.delete('/:id', protect, deleteComparison);

module.exports = router;
