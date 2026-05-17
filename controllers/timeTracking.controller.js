const TimeEntry     = require('../models/TimeEntry.model');
const Timer         = require('../models/Timer.model');
const Expense       = require('../models/Expense.model');
const Matter        = require('../models/Matter.model');
const FirmSettings  = require('../models/FirmSettings.model');
const { sendSuccess, sendError } = require('../utils/response');

function applyRounding(hours, roundTo) {
  if (!roundTo || roundTo <= 1) return hours;
  const mins    = hours * 60;
  const rounded = Math.ceil(mins / roundTo) * roundTo;
  return +(rounded / 60).toFixed(4);
}

const getFirmId = (req) => req.user.firmId || req.user._id;

/* ── Time Entries ──────────────────────────────────────────────── */
exports.list = async (req, res) => {
  const { matterId, userId, isBillable, isBilled, from, to, limit = 200 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isDeleted: { $ne: true } };
  if (matterId) filter.matterId = matterId;
  if (userId)   filter.userId   = userId;
  if (isBillable !== undefined) filter.isBillable = isBillable === 'true';
  if (isBilled   !== undefined) filter.isBilled   = isBilled   === 'true';
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }
  const entries = await TimeEntry.find(filter)
    .populate('matterId', 'title matterNumber')
    .populate('userId', 'name')
    .sort({ date: -1 })
    .limit(Number(limit))
    .lean();

  const totalHours    = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const billableHours = entries.filter(e => e.isBillable).reduce((s, e) => s + (e.hours || 0), 0);
  const totalValue    = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const unbilledValue = entries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => s + (e.amount || 0), 0);

  sendSuccess(res, {
    entries,
    totalHours:    +totalHours.toFixed(2),
    billableHours: +billableHours.toFixed(2),
    totalValue:    +totalValue.toFixed(2),
    unbilledValue: +unbilledValue.toFixed(2),
  }, 'Time entries fetched');
};

exports.get = async (req, res) => {
  const entry = await TimeEntry.findOne({ _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } })
    .populate('matterId', 'title matterNumber').lean();
  if (!entry) return sendError(res, 'Time entry not found', 404);
  sendSuccess(res, entry, 'Time entry fetched');
};

exports.create = async (req, res) => {
  const firmId = getFirmId(req);
  if (req.body.matterId) {
    const matter = await Matter.findOne({ _id: req.body.matterId, firmId, isDeleted: { $ne: true } });
    if (!matter) return sendError(res, 'Matter not found', 404);
  }

  let { hours, rate, amount, ...rest } = req.body;

  // Apply firm time-rounding rule
  const settings = await FirmSettings.findOne({ firmId }).lean();
  if (settings?.timeRounding?.enabled && hours) {
    hours  = applyRounding(Number(hours), settings.timeRounding.roundTo);
    amount = rate ? +(hours * Number(rate)).toFixed(2) : amount;
  }

  const entry = await TimeEntry.create({ ...rest, hours, rate, amount, firmId, userId: req.user._id });
  sendSuccess(res, entry, 'Time entry created', 201);
};

exports.update = async (req, res) => {
  const entry = await TimeEntry.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    req.body,
    { new: true, runValidators: true }
  );
  if (!entry) return sendError(res, 'Time entry not found', 404);
  sendSuccess(res, entry, 'Time entry updated');
};

exports.remove = async (req, res) => {
  const entry = await TimeEntry.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { isDeleted: true },
    { new: true }
  );
  if (!entry) return sendError(res, 'Time entry not found', 404);
  sendSuccess(res, null, 'Time entry deleted');
};

exports.bulkUpdate = async (req, res) => {
  const { ids, update } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 'ids array required', 400);
  const firmId = getFirmId(req);
  const result = await TimeEntry.updateMany(
    { _id: { $in: ids }, firmId, isDeleted: { $ne: true } },
    update
  );
  sendSuccess(res, { modifiedCount: result.modifiedCount }, 'Entries updated');
};

/* ── Timers ────────────────────────────────────────────────────── */
exports.listTimers = async (req, res) => {
  const timers = await Timer.find({ userId: req.user._id, isRunning: true })
    .populate('matterId', 'title matterNumber').lean();
  sendSuccess(res, timers, 'Active timers fetched');
};

exports.startTimer = async (req, res) => {
  const firmId = getFirmId(req);
  const { matterId, activityType, description } = req.body;

  if (matterId) {
    const existing = await Timer.findOne({ userId: req.user._id, matterId });
    if (existing) return sendError(res, 'A timer is already running for this matter', 409);
  }

  const count = await Timer.countDocuments({ userId: req.user._id, isRunning: true });
  if (count >= 5) return sendError(res, 'Maximum 5 concurrent timers allowed', 400);

  const timer = await Timer.create({
    matterId, activityType, description,
    userId: req.user._id,
    firmId,
    startedAt: new Date(),
    isRunning: true,
    isPaused: false,
    pausedDuration: 0,
    lastSyncAt: new Date(),
  });
  sendSuccess(res, timer, 'Timer started', 201);
};

exports.pauseTimer = async (req, res) => {
  const timer = await Timer.findOne({ _id: req.params.id, userId: req.user._id, isRunning: true });
  if (!timer) return sendError(res, 'Timer not found or already stopped', 404);
  if (timer.isPaused) return sendError(res, 'Timer is already paused', 400);

  timer.isPaused   = true;
  timer.pausedAt   = new Date();
  timer.lastSyncAt = new Date();
  await timer.save();
  sendSuccess(res, timer, 'Timer paused');
};

exports.resumeTimer = async (req, res) => {
  const timer = await Timer.findOne({ _id: req.params.id, userId: req.user._id, isRunning: true });
  if (!timer) return sendError(res, 'Timer not found', 404);
  if (!timer.isPaused) return sendError(res, 'Timer is not paused', 400);

  const pausedMs = Date.now() - new Date(timer.pausedAt).getTime();
  timer.pausedDuration += pausedMs;
  timer.isPaused   = false;
  timer.pausedAt   = undefined;
  timer.lastSyncAt = new Date();
  await timer.save();
  sendSuccess(res, timer, 'Timer resumed');
};

exports.stopTimer = async (req, res) => {
  const timer = await Timer.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!timer) return sendError(res, 'Timer not found', 404);

  const firmId = getFirmId(req);
  const now    = Date.now();
  let pausedDuration = timer.pausedDuration || 0;

  if (timer.isPaused && timer.pausedAt) {
    pausedDuration += now - new Date(timer.pausedAt).getTime();
  }

  const elapsedMs = now - new Date(timer.startedAt).getTime() - pausedDuration;
  const hours     = Math.max(0.01, +(elapsedMs / 3600000).toFixed(2));

  let rate = parseFloat(req.body.rate) || 0;
  if (!rate) {
    try {
      const FirmSettings = require('../models/FirmSettings.model');
      const firm = await FirmSettings.findOne({ firmId }).lean();
      rate = firm?.defaultHourlyRate || 0;
    } catch (_) { rate = 0; }
  }

  const entry = await TimeEntry.create({
    firmId,
    userId:       req.user._id,
    matterId:     timer.matterId,
    activityType: req.body.activityType || timer.activityType || 'admin',
    description:  req.body.description || timer.description,
    hours,
    rate,
    isBillable:   req.body.isBillable !== undefined ? req.body.isBillable : true,
    date:         timer.startedAt,
  });

  sendSuccess(res, { timer, entry, elapsedHours: hours }, 'Timer stopped and entry saved');
};

/* ── Expenses ──────────────────────────────────────────────────── */
exports.listExpenses = async (req, res) => {
  const { matterId, userId, category, approvalStatus, from, to, limit = 200 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isDeleted: { $ne: true } };
  if (matterId)       filter.matterId       = matterId;
  if (userId)         filter.userId         = userId;
  if (category)       filter.category       = category;
  if (approvalStatus) filter.approvalStatus = approvalStatus;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }
  const expenses = await Expense.find(filter)
    .populate('matterId', 'title matterNumber')
    .populate('userId', 'name')
    .sort({ date: -1 })
    .limit(Number(limit))
    .lean();

  const totalAmount    = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const billableAmount = expenses.filter(e => e.isBillable).reduce((s, e) => s + (e.amount || 0), 0);
  const unbilledAmount = expenses.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => s + (e.amount || 0), 0);

  sendSuccess(res, {
    expenses,
    totalAmount:    +totalAmount.toFixed(2),
    billableAmount: +billableAmount.toFixed(2),
    unbilledAmount: +unbilledAmount.toFixed(2),
  }, 'Expenses fetched');
};

exports.createExpense = async (req, res) => {
  const firmId = getFirmId(req);
  if (req.body.matterId) {
    const matter = await Matter.findOne({ _id: req.body.matterId, firmId, isDeleted: { $ne: true } });
    if (!matter) return sendError(res, 'Matter not found', 404);
  }
  const expense = await Expense.create({ ...req.body, firmId, userId: req.user._id });
  sendSuccess(res, expense, 'Expense created', 201);
};

exports.updateExpense = async (req, res) => {
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    req.body,
    { new: true, runValidators: true }
  );
  if (!expense) return sendError(res, 'Expense not found', 404);
  sendSuccess(res, expense, 'Expense updated');
};

exports.deleteExpense = async (req, res) => {
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { isDeleted: true },
    { new: true }
  );
  if (!expense) return sendError(res, 'Expense not found', 404);
  sendSuccess(res, null, 'Expense deleted');
};

exports.approveExpense = async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return sendError(res, 'Invalid status', 400);
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { approvalStatus: status, approvedBy: req.user._id, approvedAt: new Date() },
    { new: true }
  );
  if (!expense) return sendError(res, 'Expense not found', 404);
  sendSuccess(res, expense, `Expense ${status}`);
};
