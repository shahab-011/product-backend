const Task = require('../models/Task.model');
const { sendSuccess, sendError } = require('../utils/response');

exports.list = async (req, res) => {
  const { matterId, status, priority, assignedTo, q, limit = 100, page = 1 } = req.query;
  const filter = { firmId: req.user._id };
  if (matterId)   filter.matterId   = matterId;
  if (status)     filter.status     = status;
  if (priority)   filter.priority   = priority;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (q) filter.title = { $regex: q, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assignedTo', 'name email')
      .populate('matterId', 'title matterNumber')
      .sort({ status: 1, priority: 1, order: 1, dueDate: 1 })
      .skip(skip).limit(Number(limit)).lean(),
    Task.countDocuments(filter),
  ]);
  sendSuccess(res, { tasks, total }, 'Tasks fetched');
};

exports.get = async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('assignedTo', 'name email')
    .populate('matterId', 'title matterNumber')
    .populate('createdBy', 'name')
    .lean();
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, task, 'Task fetched');
};

exports.create = async (req, res) => {
  const task = await Task.create({ ...req.body, firmId: req.user._id, createdBy: req.user._id });
  sendSuccess(res, task, 'Task created', 201);
};

exports.update = async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  ).populate('assignedTo', 'name email').populate('matterId', 'title matterNumber');
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, task, 'Task updated');
};

exports.remove = async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!task) return sendError(res, 'Task not found', 404);
  sendSuccess(res, null, 'Task deleted');
};
