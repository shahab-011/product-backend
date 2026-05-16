const Workflow = require('../models/Workflow.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

exports.list = async (req, res) => {
  const workflows = await Workflow.find({ firmId: getFirmId(req) }).sort({ createdAt: -1 }).lean();
  sendSuccess(res, workflows, 'Workflows fetched');
};

exports.create = async (req, res) => {
  const workflow = await Workflow.create({ ...req.body, firmId: getFirmId(req) });
  sendSuccess(res, workflow, 'Workflow created', 201);
};

exports.update = async (req, res) => {
  const workflow = await Workflow.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    req.body,
    { new: true, runValidators: true }
  );
  if (!workflow) return sendError(res, 'Workflow not found', 404);
  sendSuccess(res, workflow, 'Workflow updated');
};

exports.toggle = async (req, res) => {
  const workflow = await Workflow.findOne({ _id: req.params.id, firmId: getFirmId(req) });
  if (!workflow) return sendError(res, 'Workflow not found', 404);
  workflow.isActive = !workflow.isActive;
  await workflow.save();
  sendSuccess(res, workflow, `Workflow ${workflow.isActive ? 'activated' : 'deactivated'}`);
};
