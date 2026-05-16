const crypto       = require('crypto');
const ESignRequest = require('../models/ESignRequest.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const getIp = req =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

const POPULATE = [
  { path: 'matterId',  select: 'title matterNumber' },
  { path: 'createdBy', select: 'name email' },
  { path: 'voidedBy',  select: 'name' },
];

/* ── List ──────────────────────────────────────────────────────── */
exports.list = async (req, res) => {
  const firmId = getFirmId(req);
  const { status, matterId, limit = 100, page = 1 } = req.query;

  const filter = { firmId };
  if (status)   filter.status   = status;
  if (matterId) filter.matterId = matterId;

  const skip = (Number(page) - 1) * Number(limit);
  const [requests, total] = await Promise.all([
    ESignRequest.find(filter)
      .populate(POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    ESignRequest.countDocuments(filter),
  ]);
  sendSuccess(res, { requests, total, page: Number(page) }, 'E-sign requests fetched');
};

/* ── Get ───────────────────────────────────────────────────────── */
exports.get = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId })
    .populate(POPULATE).lean();
  if (!request) return sendError(res, 'E-sign request not found', 404);
  sendSuccess(res, request, 'E-sign request fetched');
};

/* ── Create ────────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  const firmId = getFirmId(req);
  const { signatories = [], ...rest } = req.body;

  // Assign signing order based on array position if sequential mode
  const mode = rest.signingMode || 'parallel';
  const enrichedSigs = signatories.map((s, i) => ({
    ...s,
    signingOrder: mode === 'sequential' ? (i + 1) : 1,
    token:        crypto.randomBytes(32).toString('hex'),
  }));

  const request = await ESignRequest.create({
    ...rest,
    firmId,
    createdBy:   req.user._id,
    signatories: enrichedSigs,
    auditTrail:  [{ event: 'Created', actor: req.user.name || req.user.email, actorEmail: req.user.email, ip: getIp(req), time: new Date() }],
  });
  const populated = await ESignRequest.findById(request._id).populate(POPULATE).lean();
  sendSuccess(res, populated, 'E-sign request created', 201);
};

/* ── Update (draft only) ────────────────────────────────────────── */
exports.update = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await ESignRequest.findOneAndUpdate(
    { _id: req.params.id, firmId, status: { $in: ['draft', 'pending'] } },
    req.body,
    { new: true, runValidators: true }
  ).populate(POPULATE);
  if (!request) return sendError(res, 'Request not found or cannot be edited', 404);
  sendSuccess(res, request, 'E-sign request updated');
};

/* ── Delete (draft only) ────────────────────────────────────────── */
exports.remove = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId, status: 'draft' });
  if (!request) return sendError(res, 'Only draft requests can be deleted', 400);
  await request.deleteOne();
  sendSuccess(res, null, 'E-sign request deleted');
};

/* ── Send to signatories ────────────────────────────────────────── */
exports.send = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId });
  if (!request) return sendError(res, 'E-sign request not found', 404);
  if (request.status === 'void') return sendError(res, 'Cannot send a voided request', 400);
  if (request.status === 'completed') return sendError(res, 'Request already completed', 400);

  request.status = 'pending';
  request.auditTrail.push({
    event:      'Sent to signatories',
    actor:      req.user.name || req.user.email,
    actorEmail: req.user.email,
    ip:         getIp(req),
    details:    `${request.signatories.length} signator${request.signatories.length === 1 ? 'y' : 'ies'} notified`,
    time:       new Date(),
  });
  await request.save();

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const links = request.signatories.map(s => ({
    name:   s.name,
    email:  s.email,
    sigUrl: `${frontendUrl}/esign/sign/${s.token}`,
  }));

  sendSuccess(res, { request, signingLinks: links }, 'E-sign request sent to signatories');
};

/* ── Void ───────────────────────────────────────────────────────── */
exports.void = async (req, res) => {
  const firmId = getFirmId(req);
  const { reason } = req.body;
  const request = await ESignRequest.findOne({
    _id: req.params.id, firmId,
    status: { $nin: ['completed', 'void'] },
  });
  if (!request) return sendError(res, 'Request not found or already completed/voided', 404);

  request.status    = 'void';
  request.voidedAt  = new Date();
  request.voidedBy  = req.user._id;
  request.voidReason = reason || '';
  request.auditTrail.push({
    event:      'Voided',
    actor:      req.user.name || req.user.email,
    actorEmail: req.user.email,
    ip:         getIp(req),
    details:    reason || '',
    time:       new Date(),
  });
  await request.save();
  sendSuccess(res, request, 'E-sign request voided');
};

/* ── Resend to unsigned ─────────────────────────────────────────── */
exports.resend = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await ESignRequest.findOne({
    _id: req.params.id, firmId,
    status: { $in: ['pending', 'partially_signed'] },
  });
  if (!request) return sendError(res, 'Request not found or not resendable', 404);

  request.signatories.forEach(s => {
    if (s.status === 'pending') s.token = crypto.randomBytes(32).toString('hex');
  });
  request.auditTrail.push({
    event:      'Resent to unsigned signatories',
    actor:      req.user.name || req.user.email,
    actorEmail: req.user.email,
    ip:         getIp(req),
    time:       new Date(),
  });
  await request.save();
  sendSuccess(res, request, 'Resent to unsigned signatories');
};

/* ── Audit trail ────────────────────────────────────────────────── */
exports.getAuditTrail = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId }).lean();
  if (!request) return sendError(res, 'E-sign request not found', 404);
  sendSuccess(res, request.auditTrail || [], 'Audit trail fetched');
};

/* ── Download signed doc ────────────────────────────────────────── */
exports.downloadSignedDoc = async (req, res) => {
  const firmId = getFirmId(req);
  const request = await ESignRequest.findOne({ _id: req.params.id, firmId }).lean();
  if (!request) return sendError(res, 'E-sign request not found', 404);
  if (request.status !== 'completed') return sendError(res, 'Document not yet fully signed', 400);
  sendSuccess(res, {
    signedDocumentId:  request.signedDocumentId || null,
    signedDocumentHash: request.signedDocumentHash || null,
    title:             request.title,
    completedAt:       request.completedAt,
  }, 'Signed document info');
};

/* ── Public: get document to sign ──────────────────────────────── */
exports.getDocumentToSign = async (req, res) => {
  const { token } = req.params;
  const request = await ESignRequest.findOne({
    'signatories.token': token,
    status:              { $in: ['pending', 'partially_signed'] },
    expiresAt:           { $gt: new Date() },
  }).populate('matterId', 'title matterNumber').lean();

  if (!request) return sendError(res, 'Invalid or expired signing link', 404);

  const signatory = request.signatories.find(s => s.token === token);
  if (!signatory) return sendError(res, 'Signatory not found', 404);
  if (signatory.status === 'signed')   return sendError(res, 'You have already signed this document', 400);
  if (signatory.status === 'declined') return sendError(res, 'You have already declined this document', 400);

  // For sequential mode — check if it's their turn
  if (request.signingMode === 'sequential') {
    const myOrder = signatory.signingOrder;
    const prevUnsigned = request.signatories.find(
      s => s.signingOrder < myOrder && s.status === 'pending'
    );
    if (prevUnsigned) return sendError(res, `Waiting for ${prevUnsigned.name} to sign first`, 400);
  }

  sendSuccess(res, {
    requestId:   request._id,
    title:       request.title,
    description: request.description,
    matter:      request.matterId,
    signingMode: request.signingMode,
    expiresAt:   request.expiresAt,
    signatory: {
      name:  signatory.name,
      email: signatory.email,
      role:  signatory.role,
      order: signatory.signingOrder,
    },
    progress: {
      signed: request.signatories.filter(s => s.status === 'signed').length,
      total:  request.signatories.length,
    },
  }, 'Document ready to sign');
};

/* ── Public: submit signature ───────────────────────────────────── */
exports.submitSignature = async (req, res) => {
  const { token } = req.params;
  const { signatureData, agreedToTerms } = req.body;

  if (!agreedToTerms) return sendError(res, 'You must agree to the e-signature terms', 400);

  const request = await ESignRequest.findOne({
    'signatories.token': token,
    status:              { $in: ['pending', 'partially_signed'] },
    expiresAt:           { $gt: new Date() },
  });
  if (!request) return sendError(res, 'Invalid or expired signing link', 404);

  const signatory = request.signatories.find(s => s.token === token);
  if (!signatory)                      return sendError(res, 'Signatory not found', 404);
  if (signatory.status === 'signed')   return sendError(res, 'Already signed', 400);
  if (signatory.status === 'declined') return sendError(res, 'You declined this document', 400);

  signatory.status          = 'signed';
  signatory.signedAt        = new Date();
  signatory.signedIp        = getIp(req);
  signatory.signedUserAgent = req.headers['user-agent'] || '';
  signatory.signatureData   = signatureData || null;

  request.auditTrail.push({
    event:      `Signed`,
    actor:      signatory.name,
    actorEmail: signatory.email,
    ip:         getIp(req),
    userAgent:  signatory.signedUserAgent,
    time:       new Date(),
    details:    `Role: ${signatory.role}`,
  });

  await request.save();

  const updatedRequest = await ESignRequest.findById(request._id).lean();
  sendSuccess(res, {
    message:    'Document signed successfully',
    signatory:  signatory.name,
    status:     updatedRequest.status,
    signedAt:   signatory.signedAt,
  }, 'Signed');
};

/* ── Public: decline ────────────────────────────────────────────── */
exports.declineSignature = async (req, res) => {
  const { token } = req.params;
  const { reason } = req.body;

  const request = await ESignRequest.findOne({
    'signatories.token': token,
    status:              { $in: ['pending', 'partially_signed'] },
  });
  if (!request) return sendError(res, 'Invalid or expired signing link', 404);

  const signatory = request.signatories.find(s => s.token === token);
  if (!signatory)                      return sendError(res, 'Signatory not found', 404);
  if (signatory.status !== 'pending')  return sendError(res, 'Already responded', 400);

  signatory.status        = 'declined';
  signatory.declineReason = reason || '';

  request.auditTrail.push({
    event:      'Declined',
    actor:      signatory.name,
    actorEmail: signatory.email,
    ip:         getIp(req),
    time:       new Date(),
    details:    reason || '',
  });

  await request.save();
  sendSuccess(res, { message: 'Signature declined', signatory: signatory.name }, 'Declined');
};
