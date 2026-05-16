const Pipeline = require('../models/Pipeline.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const DEFAULT_STAGES = [
  { name: 'New Lead',               color: '#3B82F6', order: 0, isWon: false, isLost: false },
  { name: 'Contacted',              color: '#10B981', order: 1, isWon: false, isLost: false },
  { name: 'Consultation Scheduled', color: '#F59E0B', order: 2, isWon: false, isLost: false },
  { name: 'Proposal Sent',          color: '#8B5CF6', order: 3, isWon: false, isLost: false },
  { name: 'Hired',                  color: '#059669', order: 4, isWon: true,  isLost: false },
  { name: 'Not Hired',              color: '#EF4444', order: 5, isWon: false, isLost: true  },
];

exports.list = async (req, res) => {
  const firmId = getFirmId(req);
  let pipelines = await Pipeline.find({ firmId }).sort({ isDefault: -1, createdAt: 1 }).lean();

  if (!pipelines.length) {
    const def = await Pipeline.create({ firmId, name: 'Default Pipeline', stages: DEFAULT_STAGES, isDefault: true });
    pipelines = [def.toObject()];
  }

  sendSuccess(res, pipelines, 'Pipelines fetched');
};

exports.create = async (req, res) => {
  const pipeline = await Pipeline.create({ ...req.body, firmId: getFirmId(req) });
  sendSuccess(res, pipeline, 'Pipeline created', 201);
};

exports.update = async (req, res) => {
  const pipeline = await Pipeline.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    req.body,
    { new: true, runValidators: true }
  );
  if (!pipeline) return sendError(res, 'Pipeline not found', 404);
  sendSuccess(res, pipeline, 'Pipeline updated');
};
