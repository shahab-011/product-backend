const crypto      = require('crypto');
const ESignRequest = require('../models/ESignRequest.model');
const { sendSuccess, sendError } = require('../utils/response');

exports.list = async (req, res) => {
  const { status, limit = 100, page = 1 } = req.query;
  const filter = { firmId: req.user._id };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [requests, total] = await Promise.all([
    ESignRequest.find(filter)
      .populate('matterId', 'title matterNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ESignRequest.countDocuments(filter),
  ]);

  sendSuccess(res, { requests, total }, 'E-sign requests fetched');
};

exports.get = async (req, res) => {
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('matterId', 'title matterNumber')
    .lean();
  if (!request) return sendError(res, 'E-sign request not found', 404);
  sendSuccess(res, request, 'E-sign request fetched');
};

exports.create = async (req, res) => {
  const request = await ESignRequest.create({
    ...req.body,
    firmId:    req.user._id,
    createdBy: req.user._id,
  });
  sendSuccess(res, request, 'E-sign request created', 201);
};

exports.update = async (req, res) => {
  const request = await ESignRequest.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id, status: { $nin: ['Completed','Void'] } },
    req.body,
    { new: true, runValidators: true }
  );
  if (!request) return sendError(res, 'E-sign request not found or cannot be edited', 404);
  sendSuccess(res, request, 'E-sign request updated');
};

exports.send = async (req, res) => {
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId: req.user._id });
  if (!request) return sendError(res, 'E-sign request not found', 404);
  if (request.status === 'Void') return sendError(res, 'Cannot send a voided request', 400);

  request.status = 'Pending';
  request.auditTrail.push({ event: 'Sent to signatories', actor: req.user.name || req.user.email });
  await request.save();

  // In production: send email to each signatory with their unique token
  sendSuccess(res, request, 'E-sign request sent to signatories');
};

exports.void = async (req, res) => {
  const request = await ESignRequest.findOne({
    _id: req.params.id, firmId: req.user._id,
    status: { $nin: ['Completed','Void'] },
  });
  if (!request) return sendError(res, 'Request not found or already completed/voided', 404);

  request.status = 'Void';
  request.auditTrail.push({ event: 'Voided', actor: req.user.name || req.user.email });
  await request.save();
  sendSuccess(res, request, 'E-sign request voided');
};

exports.resend = async (req, res) => {
  const request = await ESignRequest.findOne({
    _id: req.params.id, firmId: req.user._id,
    status: { $in: ['Pending','Partially Signed'] },
  });
  if (!request) return sendError(res, 'Request not found or not in a resendable state', 404);

  // Regenerate tokens for unsigned signatories
  request.signatories = request.signatories.map(s => {
    if (!s.signed) s.token = crypto.randomBytes(24).toString('hex');
    return s;
  });
  request.auditTrail.push({ event: 'Resent to unsigned signatories', actor: req.user.name || req.user.email });
  await request.save();
  sendSuccess(res, request, 'E-sign request resent');
};

// Public endpoint — signs via unique token (no auth required)
exports.signViaToken = async (req, res) => {
  const { token } = req.params;
  const request = await ESignRequest.findOne({
    'signatories.token': token,
    status: { $in: ['Pending','Partially Signed'] },
  });
  if (!request) return sendError(res, 'Invalid or expired signing link', 404);

  const signatory = request.signatories.find(s => s.token === token);
  if (!signatory) return sendError(res, 'Signatory not found', 404);
  if (signatory.signed) return sendError(res, 'Already signed', 400);

  signatory.signed   = true;
  signatory.signedAt = new Date();
  signatory.token    = undefined;

  request.auditTrail.push({ event: `Signed by ${signatory.name}`, actor: signatory.email, time: new Date() });
  await request.save();

  sendSuccess(res, { message: 'Document signed successfully', signatory: signatory.name }, 'Signed');
};

exports.remove = async (req, res) => {
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId: req.user._id, status: 'Draft' });
  if (!request) return sendError(res, 'Only draft requests can be deleted', 400);
  await request.deleteOne();
  sendSuccess(res, null, 'E-sign request deleted');
};
