const crypto              = require('crypto');
const ClientPortalAccess  = require('../models/ClientPortalAccess.model');
const PortalMessage       = require('../models/PortalMessage.model');
const PracticeDocument    = require('../models/PracticeDocument.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

/* ══════════════════════════════════════════════════════════════
   FIRM-SIDE (authenticated with regular JWT)
══════════════════════════════════════════════════════════════ */

exports.inviteClient = async (req, res) => {
  const firmId = getFirmId(req);
  const { email, matterId, clientId, sessionTimeout } = req.body;
  if (!email) return sendError(res, 'Client email required', 400);

  // Upsert — one active access per email per firm
  let access = await ClientPortalAccess.findOne({ firmId, email, isActive: true });
  if (!access) {
    access = await ClientPortalAccess.create({
      firmId,
      matterId:       matterId || undefined,
      clientId:       clientId || undefined,
      email,
      sessionTimeout: sessionTimeout || 15,
      invitedBy:      req.user._id,
      accessToken:    crypto.randomBytes(32).toString('hex'),
    });
  }

  const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal?token=${access.accessToken}`;
  sendSuccess(res, { access, portalUrl }, 'Portal invitation created', 201);
};

exports.listAccesses = async (req, res) => {
  const firmId = getFirmId(req);
  const accesses = await ClientPortalAccess.find({ firmId })
    .populate('matterId', 'title matterNumber')
    .populate('clientId', 'firstName lastName email')
    .sort({ createdAt: -1 }).lean();
  sendSuccess(res, accesses, 'Portal accesses fetched');
};

exports.revokeAccess = async (req, res) => {
  const firmId = getFirmId(req);
  const access = await ClientPortalAccess.findOneAndUpdate(
    { _id: req.params.id, firmId },
    { isActive: false },
    { new: true }
  );
  if (!access) return sendError(res, 'Portal access not found', 404);
  sendSuccess(res, null, 'Portal access revoked');
};

exports.sendMessageFromFirm = async (req, res) => {
  const firmId = getFirmId(req);
  const { portalId, body, matterId } = req.body;
  if (!body?.trim() || !portalId) return sendError(res, 'portalId and body required', 400);

  const access = await ClientPortalAccess.findOne({ _id: portalId, firmId, isActive: true });
  if (!access) return sendError(res, 'Portal access not found', 404);

  const msg = await PortalMessage.create({
    firmId,
    matterId:    matterId || access.matterId,
    clientId:    access.clientId,
    portalId,
    senderType:  'firm',
    senderId:    req.user._id,
    senderName:  req.user.name || req.user.email,
    body:        body.trim(),
    readByFirm:  true,
  });
  sendSuccess(res, msg, 'Message sent', 201);
};

/* ══════════════════════════════════════════════════════════════
   CLIENT-SIDE PUBLIC AUTH
══════════════════════════════════════════════════════════════ */

exports.requestOTP = async (req, res) => {
  const { email } = req.body;
  if (!email) return sendError(res, 'Email required', 400);

  const access = await ClientPortalAccess.findOne({ email: email.toLowerCase(), isActive: true });
  if (!access) return sendError(res, 'No active portal access found for this email', 404);

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  access.otpCode     = otp;
  access.otpExpires  = expiry;
  access.otpAttempts = 0;
  await access.save();

  // In production: send email with OTP.
  // For demo: return OTP in response (remove in production)
  const isDev = process.env.NODE_ENV !== 'production';
  sendSuccess(res, { otpSent: true, ...(isDev && { otp }) }, 'OTP sent to your email');
};

exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return sendError(res, 'Email and OTP required', 400);

  const access = await ClientPortalAccess.findOne({ email: email.toLowerCase(), isActive: true });
  if (!access) return sendError(res, 'Portal access not found', 404);

  if (!access.otpCode || !access.otpExpires) return sendError(res, 'No OTP requested — request a new one', 400);
  if (new Date() > access.otpExpires) return sendError(res, 'OTP has expired — request a new one', 400);
  if ((access.otpAttempts || 0) >= 5) return sendError(res, 'Too many attempts — request a new OTP', 429);

  if (access.otpCode !== String(otp)) {
    access.otpAttempts = (access.otpAttempts || 0) + 1;
    await access.save();
    return sendError(res, 'Incorrect OTP', 400);
  }

  // Success — clear OTP, update lastAccess
  access.otpCode     = undefined;
  access.otpExpires  = undefined;
  access.otpAttempts = 0;
  access.lastAccessAt = new Date();
  await access.save();

  sendSuccess(res, {
    accessToken:    access.accessToken,
    sessionTimeout: access.sessionTimeout,
    email:          access.email,
  }, 'Authenticated successfully');
};

/* ══════════════════════════════════════════════════════════════
   CLIENT-SIDE PORTAL (protected by portalAuth middleware)
   req.portalAccess = { firmId, matterId, clientId, email, ... }
══════════════════════════════════════════════════════════════ */

exports.getPortalMe = async (req, res) => {
  const { portalAccess } = req;
  const matter = portalAccess.matterId; // already populated

  let firm = null;
  try {
    const User = require('../models/User.model');
    firm = await User.findById(portalAccess.firmId).select('name email firmName phone').lean();
  } catch {}

  sendSuccess(res, {
    email:          portalAccess.email,
    sessionTimeout: portalAccess.sessionTimeout,
    matter,
    firm,
    portalId:       portalAccess._id,
  }, 'Portal info fetched');
};

exports.getPortalMatter = async (req, res) => {
  const { portalAccess } = req;
  if (!portalAccess.matterId) return sendError(res, 'No matter linked to this portal', 404);

  const Matter = require('../models/Matter.model');
  const matter = await Matter.findById(portalAccess.matterId._id || portalAccess.matterId)
    .populate('assignedAttorney', 'name email')
    .lean();
  if (!matter) return sendError(res, 'Matter not found', 404);
  sendSuccess(res, matter, 'Matter overview fetched');
};

exports.listPortalDocuments = async (req, res) => {
  const { portalAccess } = req;
  const filter = {
    firmId:          portalAccess.firmId,
    isClientVisible: true,
    isDeleted:       { $ne: true },
  };
  if (portalAccess.matterId) filter.matterId = portalAccess.matterId._id || portalAccess.matterId;

  const docs = await PracticeDocument.find(filter)
    .populate('folderId', 'name')
    .sort({ createdAt: -1 }).lean();
  sendSuccess(res, docs, 'Documents fetched');
};

exports.clientUploadDocument = async (req, res) => {
  const { portalAccess } = req;
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const { originalname, mimetype, size } = req.file;
  const s3Key = `portal/${portalAccess.firmId}/${Date.now()}-${originalname.replace(/\s+/g, '_')}`;

  const doc = await PracticeDocument.create({
    firmId:          portalAccess.firmId,
    matterId:        portalAccess.matterId?._id || portalAccess.matterId || undefined,
    name:            originalname,
    originalName:    originalname,
    mimeType:        mimetype,
    size,
    s3Key,
    description:     req.body.description || 'Uploaded by client via portal',
    isClientVisible: true,
    uploadedBy:      portalAccess.firmId, // firm as placeholder
    currentVersion:  1,
    versions:        [{ versionNumber: 1, s3Key, size }],
  });
  sendSuccess(res, doc, 'Document uploaded', 201);
};

exports.listPortalInvoices = async (req, res) => {
  const { portalAccess } = req;
  if (!portalAccess.matterId) return sendSuccess(res, [], 'No matter linked');

  let invoices = [];
  try {
    const Invoice = require('../models/Invoice.model');
    invoices = await Invoice.find({
      firmId:   portalAccess.firmId,
      matterId: portalAccess.matterId._id || portalAccess.matterId,
    }).sort({ createdAt: -1 }).lean();
  } catch {}

  sendSuccess(res, invoices, 'Invoices fetched');
};

exports.listPortalAppointments = async (req, res) => {
  const { portalAccess } = req;
  if (!portalAccess.matterId) return sendSuccess(res, [], 'No matter linked');

  let events = [];
  try {
    const CalendarEvent = require('../models/CalendarEvent.model');
    events = await CalendarEvent.find({
      firmId:    portalAccess.firmId,
      matterId:  portalAccess.matterId._id || portalAccess.matterId,
      startDate: { $gte: new Date() },
      isDeleted: { $ne: true },
    }).sort({ startDate: 1 }).lean();
  } catch {}

  sendSuccess(res, events, 'Appointments fetched');
};

exports.listPortalMessages = async (req, res) => {
  const { portalAccess } = req;
  const messages = await PortalMessage.find({ portalId: portalAccess._id })
    .sort({ createdAt: -1 }).limit(100).lean();
  sendSuccess(res, messages.reverse(), 'Messages fetched');
};

exports.sendMessageFromClient = async (req, res) => {
  const { portalAccess } = req;
  const { body } = req.body;
  if (!body?.trim()) return sendError(res, 'Message body required', 400);

  const msg = await PortalMessage.create({
    firmId:      portalAccess.firmId,
    matterId:    portalAccess.matterId?._id || portalAccess.matterId,
    clientId:    portalAccess.clientId,
    portalId:    portalAccess._id,
    senderType:  'client',
    senderName:  portalAccess.email,
    body:        body.trim(),
    readByClient: true,
  });
  sendSuccess(res, msg, 'Message sent', 201);
};

exports.markMessageRead = async (req, res) => {
  const { portalAccess } = req;
  const msg = await PortalMessage.findOneAndUpdate(
    { _id: req.params.id, portalId: portalAccess._id },
    { readByClient: true },
    { new: true }
  );
  if (!msg) return sendError(res, 'Message not found', 404);
  sendSuccess(res, msg, 'Message marked read');
};

exports.listPendingForms = async (req, res) => {
  const { portalAccess } = req;
  const forms = [];

  // E-sign requests pending this client's email
  try {
    const ESignRequest = require('../models/ESignRequest.model');
    const esigns = await ESignRequest.find({
      firmId:                 portalAccess.firmId,
      'signatories.email':    portalAccess.email,
      'signatories.status':   'pending',
      status:                 { $in: ['pending', 'partially_signed'] },
    }).lean();
    esigns.forEach(e => {
      const sig = e.signatories.find(s => s.email === portalAccess.email && s.status === 'pending');
      if (sig) forms.push({ type: 'esign', title: e.title, token: sig.token, requestId: e._id });
    });
  } catch {}

  sendSuccess(res, forms, 'Pending forms fetched');
};

/* ── Magic-link auth (visit portal URL with token) ─────────────── */
exports.magicLinkAuth = async (req, res) => {
  const { token } = req.params;
  const access = await ClientPortalAccess.findOne({ accessToken: token, isActive: true });
  if (!access) return sendError(res, 'Invalid or expired portal link', 404);

  access.lastAccessAt = new Date();
  await access.save();

  sendSuccess(res, {
    accessToken:    access.accessToken,
    sessionTimeout: access.sessionTimeout,
    email:          access.email,
  }, 'Portal access granted via magic link');
};
