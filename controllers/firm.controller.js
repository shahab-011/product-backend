const FirmSettings = require('../models/FirmSettings.model');
const CustomRole   = require('../models/CustomRole.model');
const { sendSuccess, sendError } = require('../utils/response');
const crypto = require('crypto');

const getFirmId = req => req.user.firmId || req.user._id;

const getOrCreate = async (firmId) => {
  let s = await FirmSettings.findOne({ firmId });
  if (!s) s = await FirmSettings.create({ firmId });
  return s;
};

/* ── Settings ───────────────────────────────────────────────────── */

exports.getSettings = async (req, res) => {
  const settings = await getOrCreate(getFirmId(req));
  sendSuccess(res, settings, 'Firm settings fetched');
};

exports.updateSettings = async (req, res) => {
  const allowed = [
    'name','address','phone','email','supportEmail','website','barNumber',
    'jurisdiction','jurisdictions','taxId','description','logo','timeZone',
    'firmSize','country','onboardingComplete',
  ];
  const update = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: getFirmId(req) }, update,
    { new: true, runValidators: true, upsert: true }
  );
  sendSuccess(res, settings, 'Firm settings updated');
};

exports.updateBillingConfig = async (req, res) => {
  const allowed = [
    'currency','defaultHourlyRate','defaultTaxRate','invoicePrefix','invoiceNumberNext',
    'paymentTermsDays','lateFeePercent','graceperiodDays','trustAccountBank',
    'allowPartialPayment','showRatesOnInvoice','showTimekeeperNames','showEntryDates',
    // legacy field names from frontend
    'defaultRate','taxRate','paymentTerms','invoicePrefix',
  ];
  const update = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  // Map legacy frontend field names to model field names
  if (update.defaultRate   !== undefined) { update.defaultHourlyRate = update.defaultRate; delete update.defaultRate; }
  if (update.taxRate       !== undefined) { update.defaultTaxRate    = update.taxRate;     delete update.taxRate; }
  if (update.paymentTerms  !== undefined) { update.paymentTermsDays  = update.paymentTerms; delete update.paymentTerms; }

  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: getFirmId(req) }, { $set: update },
    { new: true, runValidators: true, upsert: true }
  );
  sendSuccess(res, settings, 'Billing configuration updated');
};

exports.updateNotifications = async (req, res) => {
  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: getFirmId(req) },
    { notifications: req.body },
    { new: true, upsert: true }
  );
  sendSuccess(res, settings.notifications, 'Notification preferences updated');
};

exports.updateSecuritySettings = async (req, res) => {
  const { enforce2FA, sessionTimeoutMinutes, ipAllowlist } = req.body;
  const update = {};
  if (enforce2FA !== undefined)            update['security.enforce2FA']            = enforce2FA;
  if (sessionTimeoutMinutes !== undefined) update['security.sessionTimeoutMinutes'] = sessionTimeoutMinutes;
  if (ipAllowlist !== undefined)           update['security.ipAllowlist']           = ipAllowlist;

  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: getFirmId(req) }, { $set: update },
    { new: true, upsert: true }
  );
  sendSuccess(res, settings.security, 'Security settings updated');
};

/* ── Team Members ───────────────────────────────────────────────── */

exports.listTeam = async (req, res) => {
  const settings = await getOrCreate(getFirmId(req));
  sendSuccess(res, settings.teamMembers, 'Team members fetched');
};

exports.inviteMember = async (req, res) => {
  const { name, email, role = 'attorney', billingRate } = req.body;
  if (!name || !email) return sendError(res, 'name and email required', 400);

  const settings = await getOrCreate(getFirmId(req));
  const exists = settings.teamMembers.find(m => m.email === email.toLowerCase());
  if (exists) return sendError(res, 'Member with this email already exists', 409);

  const inviteToken = crypto.randomBytes(24).toString('hex');
  settings.teamMembers.push({
    name, email: email.toLowerCase(), role,
    billingRate: billingRate || 0,
    status: 'invited', invitedAt: new Date(), inviteToken,
    initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3),
  });
  await settings.save();
  sendSuccess(res, settings.teamMembers[settings.teamMembers.length - 1], 'Member invited', 201);
};

exports.updateMember = async (req, res) => {
  const settings = await FirmSettings.findOne({ firmId: getFirmId(req) });
  if (!settings) return sendError(res, 'Firm settings not found', 404);

  const member = settings.teamMembers.id(req.params.memberId);
  if (!member) return sendError(res, 'Team member not found', 404);

  const allowed = ['name','role','billingRate','initials','signature','customRoleId'];
  allowed.forEach(k => { if (req.body[k] !== undefined) member[k] = req.body[k]; });
  await settings.save();
  sendSuccess(res, member, 'Team member updated');
};

exports.toggleMemberStatus = async (req, res) => {
  const settings = await FirmSettings.findOne({ firmId: getFirmId(req) });
  if (!settings) return sendError(res, 'Firm settings not found', 404);

  const member = settings.teamMembers.id(req.params.memberId);
  if (!member) return sendError(res, 'Team member not found', 404);

  member.status = member.status === 'active' ? 'inactive' : 'active';
  if (member.status === 'active' && !member.joinedAt) member.joinedAt = new Date();
  await settings.save();
  sendSuccess(res, member, `Member ${member.status}`);
};

exports.removeMember = async (req, res) => {
  const settings = await FirmSettings.findOne({ firmId: getFirmId(req) });
  if (!settings) return sendError(res, 'Firm settings not found', 404);

  const member = settings.teamMembers.id(req.params.memberId);
  if (!member) return sendError(res, 'Team member not found', 404);

  member.deleteOne();
  await settings.save();
  sendSuccess(res, null, 'Team member removed');
};

/* ── Roles ──────────────────────────────────────────────────────── */

exports.listRoles = async (req, res) => {
  const roles = await CustomRole.find({ firmId: getFirmId(req) }).sort({ createdAt: 1 }).lean();
  sendSuccess(res, roles, 'Roles fetched');
};

exports.createCustomRole = async (req, res) => {
  const role = await CustomRole.create({ ...req.body, firmId: getFirmId(req) });
  sendSuccess(res, role, 'Custom role created', 201);
};

exports.updateCustomRole = async (req, res) => {
  const role = await CustomRole.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    req.body, { new: true, runValidators: true }
  );
  if (!role) return sendError(res, 'Role not found', 404);
  sendSuccess(res, role, 'Role updated');
};

exports.deleteCustomRole = async (req, res) => {
  const role = await CustomRole.findOneAndDelete({ _id: req.params.id, firmId: getFirmId(req) });
  if (!role) return sendError(res, 'Role not found', 404);
  sendSuccess(res, null, 'Role deleted');
};

/* ── Practice Areas ─────────────────────────────────────────────── */

exports.updatePracticeAreas = async (req, res) => {
  const { practiceAreaConfig } = req.body;
  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: getFirmId(req) },
    { practiceAreaConfig: practiceAreaConfig || [] },
    { new: true, upsert: true }
  );
  sendSuccess(res, settings.practiceAreaConfig, 'Practice areas updated');
};

/* ── Integrations ───────────────────────────────────────────────── */

exports.disconnectIntegration = async (req, res) => {
  const name = req.params.name; // e.g. 'google', 'outlook', 'quickbooks'
  const SUPPORTED = ['google','outlook','quickbooks','stripe','twilio','docusign','dropbox','box'];
  if (!SUPPORTED.includes(name)) return sendError(res, 'Unknown integration', 400);

  const update = {};
  update[`integrations.${name}Connected`]     = false;
  update[`integrations.${name}RefreshToken`]  = undefined;
  update[`integrations.${name}Token`]         = undefined;

  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: getFirmId(req) }, { $set: update, $unset: { [`integrations.${name}RefreshToken`]: 1, [`integrations.${name}Token`]: 1 } },
    { new: true }
  );
  sendSuccess(res, settings?.integrations, `${name} disconnected`);
};

/* ── Stripe ─────────────────────────────────────────────────────── */

exports.startStripeOnboarding = async (req, res) => {
  sendSuccess(res, { url: null, message: 'Stripe onboarding requires live Stripe credentials.' }, 'Stripe onboarding info');
};

exports.stripeOnboardingCallback = async (req, res) => {
  sendSuccess(res, { message: 'Stripe callback received.' }, 'OK');
};

exports.getStripeAccountStatus = async (req, res) => {
  const settings = await getOrCreate(getFirmId(req));
  sendSuccess(res, { connected: settings.stripeOnboarded, accountId: settings.stripeAccountId }, 'Stripe status');
};

/* ── Audit Log ──────────────────────────────────────────────────── */

exports.getAuditLog = async (req, res) => {
  sendSuccess(res, [], 'Audit log fetched (placeholder — store with a dedicated AuditLog model)');
};

/* ── Data Export ────────────────────────────────────────────────── */

exports.exportAllData = async (req, res) => {
  const firmId = getFirmId(req);
  const Matter  = require('../models/Matter.model');
  const Contact = require('../models/Contact.model');
  const Invoice = require('../models/Invoice.model');
  const Lead    = require('../models/Lead.model');

  const [settings, matters, contacts, invoices, leads] = await Promise.all([
    FirmSettings.findOne({ firmId }).lean(),
    Matter.find({ firmId, isDeleted: { $ne: true } }).lean(),
    Contact.find({ firmId }).lean(),
    Invoice.find({ firmId }).lean(),
    Lead.find({ firmId, isDeleted: { $ne: true } }).lean(),
  ]);

  sendSuccess(res, {
    exportedAt: new Date(),
    settings, matters, contacts, invoices, leads,
  }, 'Data exported');
};
