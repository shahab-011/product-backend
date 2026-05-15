const router = require('express').Router();
const ctrl   = require('../controllers/timeTracking.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin')];

// Time entries
router.get('/time-entries',      ...auth, ctrl.list);
router.post('/time-entries',     ...auth, ctrl.create);
router.get('/time-entries/:id',  ...auth, ctrl.get);
router.put('/time-entries/:id',  ...auth, ctrl.update);
router.delete('/time-entries/:id', ...auth, ctrl.remove);

// Active timer
router.get('/timers',        ...auth, ctrl.getActiveTimer);
router.post('/timers',       ...auth, ctrl.startTimer);
router.post('/timers/:id/stop', ...auth, ctrl.stopTimer);

module.exports = router;
