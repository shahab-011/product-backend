const router = require('express').Router();
const ctrl   = require('../controllers/conflicts.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

router.get('/check', ...auth, ctrl.check);

module.exports = router;
