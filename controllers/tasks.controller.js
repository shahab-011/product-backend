const Task     = require('../models/Task.model');
const TaskList = require('../models/TaskList.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const POPULATE = [
  { path: 'assignedTo',  select: 'name email' },
  { path: 'matterId',    select: 'title matterNumber' },
  { path: 'createdBy',   select: 'name' },
  { path: 'completedBy', select: 'name' },
];

/* ── Tasks ────────────────────────────────────────────────────────── */

exports.listTasks = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId, status, priority, assignedTo, taskListId, due, q, limit = 100, page = 1 } = req.query;

  const filter = { firmId, isDeleted: { $ne: true } };
  if (matterId)   filter.matterId   = matterId;
  if (priority)   filter.priority   = priority;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (taskListId) filter.taskListId = taskListId;
  if (q)          filter.title = { $regex: q, $options: 'i' };

  if (status) {
    filter.status = status;
  } else if (due === 'overdue') {
    filter.dueDate = { $lt: new Date() };
    filter.status  = { $ne: 'completed' };
  }

  if (due === 'today') {
    const s = new Date(); s.setHours(0,0,0,0);
    const e = new Date(); e.setHours(23,59,59,999);
    filter.dueDate = { $gte: s, $lte: e };
  } else if (due === 'week') {
    const s = new Date(); s.setHours(0,0,0,0);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    filter.dueDate = { $gte: s, $lte: e };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate(POPULATE)
      .sort({ order: 1, dueDate: 1, createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    Task.countDocuments(filter),
  ]);
  sendSuccess(res, { tasks, total, page: Number(page) }, 'Tasks fetched');
};

exports.getMyTasks = async (req, res) => {
  const firmId = getFirmId(req);
  const tasks = await Task.find({
    firmId,
    isDeleted: { $ne: true },
    $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }],
    status: { $ne: 'completed' },
  }).populate(POPULATE).sort({ dueDate: 1, priority: 1 }).lean();
  sendSuccess(res, tasks, 'My tasks');
};

exports.getOverdueTasks = async (req, res) => {
  const firmId = getFirmId(req);
  const tasks = await Task.find({
    firmId,
    isDeleted: { $ne: true },
    dueDate:   { $lt: new Date() },
    status:    { $ne: 'completed' },
  }).populate(POPULATE).sort({ dueDate: 1 }).lean();
  sendSuccess(res, tasks, 'Overdue tasks');
};

exports.getTask = async (req, res) => {
  const firmId = getFirmId(req);
  const task = await Task.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } })
    .populate(POPULATE).lean();
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, task, 'Task fetched');
};

exports.createTask = async (req, res) => {
  const firmId = getFirmId(req);
  const task = await Task.create({ ...req.body, firmId, createdBy: req.user._id });
  const populated = await Task.findById(task._id).populate(POPULATE).lean();
  sendSuccess(res, populated, 'Task created', 201);
};

exports.updateTask = async (req, res) => {
  const firmId = getFirmId(req);
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, firmId, isDeleted: { $ne: true } },
    req.body,
    { new: true, runValidators: true }
  ).populate(POPULATE);
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, task, 'Task updated');
};

exports.deleteTask = async (req, res) => {
  const firmId = getFirmId(req);
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, firmId },
    { isDeleted: true }, { new: true }
  );
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, null, 'Task deleted');
};

exports.completeTask = async (req, res) => {
  const firmId = getFirmId(req);
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, firmId, isDeleted: { $ne: true } },
    { status: 'completed', completedAt: new Date(), completedBy: req.user._id },
    { new: true }
  ).populate(POPULATE);
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, task, 'Task completed');
};

exports.reopenTask = async (req, res) => {
  const firmId = getFirmId(req);
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, firmId, isDeleted: { $ne: true } },
    { status: 'to_do', $unset: { completedAt: '', completedBy: '' } },
    { new: true }
  ).populate(POPULATE);
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, task, 'Task reopened');
};

exports.reorderTasks = async (req, res) => {
  const firmId = getFirmId(req);
  const { items } = req.body;
  if (!Array.isArray(items)) return sendError(res, 'items array required', 400);
  await Task.bulkWrite(
    items.map(({ id, order, status }) => ({
      updateOne: {
        filter: { _id: id, firmId },
        update: { $set: { order, ...(status ? { status } : {}) } },
      },
    }))
  );
  sendSuccess(res, null, 'Tasks reordered');
};

exports.bulkCreateTasks = async (req, res) => {
  const firmId = getFirmId(req);
  const { tasks } = req.body;
  if (!Array.isArray(tasks) || !tasks.length) return sendError(res, 'tasks array required', 400);
  const created = await Task.insertMany(
    tasks.map(t => ({ ...t, firmId, createdBy: req.user._id }))
  );
  sendSuccess(res, created, 'Tasks created', 201);
};

/* ── Task Lists ───────────────────────────────────────────────────── */

exports.listTaskLists = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId, isTemplate } = req.query;
  const filter = { firmId, isDeleted: { $ne: true } };
  if (matterId)              filter.matterId   = matterId;
  if (isTemplate !== undefined) filter.isTemplate = isTemplate === 'true';

  const lists = await TaskList.find(filter)
    .populate('matterId', 'title matterNumber')
    .sort({ order: 1, createdAt: -1 }).lean();

  const withProgress = await Promise.all(lists.map(async list => {
    const [total, completed] = await Promise.all([
      Task.countDocuments({ taskListId: list._id, isDeleted: { $ne: true } }),
      Task.countDocuments({ taskListId: list._id, status: 'completed', isDeleted: { $ne: true } }),
    ]);
    return { ...list, progress: { total, completed } };
  }));

  sendSuccess(res, withProgress, 'Task lists fetched');
};

exports.createTaskList = async (req, res) => {
  const firmId = getFirmId(req);
  const list = await TaskList.create({ ...req.body, firmId });
  sendSuccess(res, list, 'Task list created', 201);
};

exports.updateTaskList = async (req, res) => {
  const firmId = getFirmId(req);
  const list = await TaskList.findOneAndUpdate(
    { _id: req.params.id, firmId, isDeleted: { $ne: true } },
    req.body,
    { new: true, runValidators: true }
  );
  if (!list) return sendError(res, 'Task list not found', 404);
  sendSuccess(res, list, 'Task list updated');
};

exports.deleteTaskList = async (req, res) => {
  const firmId = getFirmId(req);
  const list = await TaskList.findOneAndUpdate(
    { _id: req.params.id, firmId }, { isDeleted: true }, { new: true }
  );
  if (!list) return sendError(res, 'Task list not found', 404);
  await Task.updateMany({ taskListId: list._id }, { isDeleted: true });
  sendSuccess(res, null, 'Task list deleted');
};

exports.applyTemplateToMatter = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId, assignedTo } = req.body;
  if (!matterId) return sendError(res, 'matterId required', 400);

  const template = await TaskList.findOne({ _id: req.params.id, firmId, isTemplate: true });
  if (!template) return sendError(res, 'Template not found', 404);

  const newList = await TaskList.create({
    firmId, matterId,
    name:         template.name,
    description:  template.description,
    isTemplate:   false,
    templateName: template.name,
    order:        template.order,
  });

  const templateTasks = await Task.find({ taskListId: template._id, isDeleted: { $ne: true } }).lean();
  if (templateTasks.length) {
    await Task.insertMany(
      templateTasks.map(({ _id, completedAt, completedBy, ...t }) => ({
        ...t,
        firmId,
        matterId,
        taskListId:  newList._id,
        createdBy:   req.user._id,
        assignedTo:  assignedTo ? [assignedTo] : [],
        status:      'to_do',
        isDeleted:   false,
      }))
    );
  }

  sendSuccess(res, newList, 'Template applied to matter', 201);
};
