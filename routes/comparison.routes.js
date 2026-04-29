const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { compare, getComparisons, getComparison } = require('../controllers/comparison.controller');

router.post('/', protect, compare);
router.get('/', protect, getComparisons);
router.get('/:id', protect, getComparison);

module.exports = router;
