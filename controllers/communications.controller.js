const CommunicationLog = require('../models/CommunicationLog.model');
const { sendSuccess, sendError } = require('../utils/response');

const TYPES      = ['Call','Email','Meeting','Note'];
const DIRECTIONS = ['Inbound','Outbound'];

exports.getTypes = (req, res) => sendSuccess(res, TYPES, 'Communication types');

exports.list = async (req, res) => {
  const { matterId, type, from, to, limit = 200, page = 1 } = req.query;
  const filter = { firmId: req.user._id };
  if (matterId) filter.matterId = matterId;
  if (type)     filter.type     = type;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    CommunicationLog.find(filter)
      .populate('matterId', 'title matterNumber')
      .populate('userId', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CommunicationLog.countDocuments(filter),
  ]);

  sendSuccess(res, { logs, total, page: Number(page), limit: Number(limit) }, 'Communications fetched');
};

exports.get = async (req, res) => {
  const log = await CommunicationLog.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('matterId', 'title matterNumber')
    .populate('userId', 'name')
    .lean();
  if (!log) return sendError(res, 'Communication log not found', 404);
  sendSuccess(res, log, 'Communication fetched');
};

exports.create = async (req, res) => {
  const log = await CommunicationLog.create({
    ...req.body,
    firmId: req.user._id,
    userId: req.user._id,
  });
  sendSuccess(res, log, 'Communication logged', 201);
};

exports.update = async (req, res) => {
  const log = await CommunicationLog.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!log) return sendError(res, 'Communication log not found', 404);
  sendSuccess(res, log, 'Communication updated');
};

exports.remove = async (req, res) => {
  const log = await CommunicationLog.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!log) return sendError(res, 'Communication log not found', 404);
  sendSuccess(res, null, 'Communication deleted');
};
