const TimeEntry = require('../models/TimeEntry.model');
const Timer     = require('../models/Timer.model');
const Matter    = require('../models/Matter.model');
const { sendSuccess, sendError } = require('../utils/response');

/* ── Time Entries ──────────────────────────────────────────────── */
exports.list = async (req, res) => {
  const { matterId, isBillable, isBilled, from, to, limit = 200 } = req.query;
  const filter = { firmId: req.user._id };
  if (matterId)              filter.matterId  = matterId;
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

  // Aggregate totals
  const totalHours    = entries.reduce((s, e) => s + e.hours, 0);
  const billableHours = entries.filter(e => e.isBillable).reduce((s, e) => s + e.hours, 0);
  const totalValue    = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const unbilledValue = entries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => s + (e.amount || 0), 0);

  sendSuccess(res, {
    entries, totalHours: +totalHours.toFixed(2), billableHours: +billableHours.toFixed(2),
    totalValue: +totalValue.toFixed(2), unbilledValue: +unbilledValue.toFixed(2),
  }, 'Time entries fetched');
};

exports.get = async (req, res) => {
  const entry = await TimeEntry.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('matterId', 'title matterNumber').lean();
  if (!entry) return sendError(res, 'Time entry not found', 404);
  sendSuccess(res, entry, 'Time entry fetched');
};

exports.create = async (req, res) => {
  // Validate matter belongs to firm
  if (req.body.matterId) {
    const matter = await Matter.findOne({ _id: req.body.matterId, firmId: req.user._id });
    if (!matter) return sendError(res, 'Matter not found', 404);
  }
  const entry = await TimeEntry.create({ ...req.body, firmId: req.user._id, userId: req.user._id });
  sendSuccess(res, entry, 'Time entry created', 201);
};

exports.update = async (req, res) => {
  const entry = await TimeEntry.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!entry) return sendError(res, 'Time entry not found', 404);
  sendSuccess(res, entry, 'Time entry updated');
};

exports.remove = async (req, res) => {
  const entry = await TimeEntry.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!entry) return sendError(res, 'Time entry not found', 404);
  sendSuccess(res, null, 'Time entry deleted');
};

/* ── Active Timer ──────────────────────────────────────────────── */
exports.startTimer = async (req, res) => {
  // Stop any existing timer first
  await Timer.findOneAndDelete({ userId: req.user._id });

  const timer = await Timer.create({
    ...req.body,
    userId:    req.user._id,
    firmId:    req.user._id,
    startedAt: new Date(),
    isRunning: true,
  });
  sendSuccess(res, timer, 'Timer started', 201);
};

exports.getActiveTimer = async (req, res) => {
  const timer = await Timer.findOne({ userId: req.user._id, isRunning: true })
    .populate('matterId', 'title matterNumber').lean();
  sendSuccess(res, timer, timer ? 'Active timer found' : 'No active timer');
};

exports.stopTimer = async (req, res) => {
  const timer = await Timer.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!timer) return sendError(res, 'Timer not found', 404);

  const elapsed = (Date.now() - new Date(timer.startedAt)) / 3600000; // hours
  const hours   = Math.max(0.1, +elapsed.toFixed(2));

  // Get firm's default rate if not supplied
  const FirmSettings = require('../models/FirmSettings.model');
  const firm = await FirmSettings.findOne({ firmId: req.user._id }).lean();
  const rate  = req.body.rate || firm?.defaultHourlyRate || 0;

  const entry = await TimeEntry.create({
    firmId:       req.user._id,
    userId:       req.user._id,
    matterId:     timer.matterId,
    activityType: timer.activityType || 'admin',
    description:  req.body.description || timer.description,
    hours,
    rate,
    isBillable:   req.body.isBillable !== undefined ? req.body.isBillable : true,
    date:         timer.startedAt,
  });

  sendSuccess(res, { timer, entry, elapsedHours: hours }, 'Timer stopped and entry saved');
};
