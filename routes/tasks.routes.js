const router = require('express').Router();
const ctrl   = require('../controllers/tasks.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Specific task routes BEFORE /:id to avoid param capture
router.get('/tasks/my-tasks',  ...auth, ctrl.getMyTasks);
router.get('/tasks/overdue',   ...auth, ctrl.getOverdueTasks);
router.patch('/tasks/reorder', ...auth, ctrl.reorderTasks);
router.post('/tasks/bulk',     ...auth, ctrl.bulkCreateTasks);

// Task CRUD
router.get('/tasks',          ...auth, ctrl.listTasks);
router.post('/tasks',         ...auth, ctrl.createTask);
router.get('/tasks/:id',      ...auth, ctrl.getTask);
router.put('/tasks/:id',      ...auth, ctrl.updateTask);
router.patch('/tasks/:id',    ...auth, ctrl.updateTask);
router.delete('/tasks/:id',   ...auth, ctrl.deleteTask);

// Task actions
router.patch('/tasks/:id/complete', ...auth, ctrl.completeTask);
router.patch('/tasks/:id/reopen',   ...auth, ctrl.reopenTask);

// Task Lists
router.get('/task-lists',     ...auth, ctrl.listTaskLists);
router.post('/task-lists',    ...auth, ctrl.createTaskList);
router.put('/task-lists/:id', ...auth, ctrl.updateTaskList);
router.patch('/task-lists/:id', ...auth, ctrl.updateTaskList);
router.delete('/task-lists/:id', ...auth, ctrl.deleteTaskList);
router.post('/task-lists/:id/apply-to-matter', ...auth, ctrl.applyTemplateToMatter);

module.exports = router;
