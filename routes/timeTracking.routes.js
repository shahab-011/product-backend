const router = require('express').Router();
const ctrl   = require('../controllers/timeTracking.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Time entries
router.get('/time-entries',          ...auth, ctrl.list);
router.post('/time-entries',         ...auth, ctrl.create);
router.patch('/time-entries/bulk',   ...auth, ctrl.bulkUpdate);
router.get('/time-entries/:id',      ...auth, ctrl.get);
router.put('/time-entries/:id',      ...auth, ctrl.update);
router.patch('/time-entries/:id',    ...auth, ctrl.update);
router.delete('/time-entries/:id',   ...auth, ctrl.remove);

// Timers
router.get('/timers',                ...auth, ctrl.listTimers);
router.post('/timers',               ...auth, ctrl.startTimer);
router.post('/timers/:id/pause',     ...auth, ctrl.pauseTimer);
router.post('/timers/:id/resume',    ...auth, ctrl.resumeTimer);
router.post('/timers/:id/stop',      ...auth, ctrl.stopTimer);

// Expenses
router.get('/expenses',              ...auth, ctrl.listExpenses);
router.post('/expenses',             ...auth, ctrl.createExpense);
router.put('/expenses/:id',          ...auth, ctrl.updateExpense);
router.patch('/expenses/:id',        ...auth, ctrl.updateExpense);
router.delete('/expenses/:id',       ...auth, ctrl.deleteExpense);
router.post('/expenses/:id/approve', ...auth, ctrl.approveExpense);

module.exports = router;
