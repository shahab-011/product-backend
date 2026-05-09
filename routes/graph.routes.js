const express = require('express');
const router  = express.Router();
const { getObligationWeb } = require('../controllers/graph.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/obligation-web', protect, getObligationWeb);

module.exports = router;
