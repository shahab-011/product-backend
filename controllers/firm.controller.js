const FirmSettings = require('../models/FirmSettings.model');
const { sendSuccess, sendError } = require('../utils/response');

const getOrCreate = async (firmId) => {
  let settings = await FirmSettings.findOne({ firmId });
  if (!settings) settings = await FirmSettings.create({ firmId });
  return settings;
};

exports.getSettings = async (req, res) => {
  const settings = await getOrCreate(req.user._id);
  sendSuccess(res, settings, 'Firm settings fetched');
};

exports.updateSettings = async (req, res) => {
  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: req.user._id },
    req.body,
    { new: true, runValidators: true, upsert: true }
  );
  sendSuccess(res, settings, 'Firm settings updated');
};

/* ── Team Members ───────────────────────────────────────────────── */
exports.listTeam = async (req, res) => {
  const settings = await getOrCreate(req.user._id);
  sendSuccess(res, settings.teamMembers, 'Team members fetched');
};

exports.inviteMember = async (req, res) => {
  const { name, email, role = 'lawyer' } = req.body;
  if (!name || !email) return sendError(res, 'name and email required', 400);

  const settings = await getOrCreate(req.user._id);
  const exists = settings.teamMembers.find(m => m.email === email);
  if (exists) return sendError(res, 'Member with this email already exists', 409);

  settings.teamMembers.push({ name, email, role, status: 'invited', joinedAt: new Date() });
  await settings.save();

  // In production: send invitation email
  sendSuccess(res, settings.teamMembers, 'Member invited', 201);
};

exports.updateMember = async (req, res) => {
  const { memberId } = req.params;
  const settings = await FirmSettings.findOne({ firmId: req.user._id });
  if (!settings) return sendError(res, 'Firm settings not found', 404);

  const member = settings.teamMembers.id(memberId);
  if (!member) return sendError(res, 'Team member not found', 404);

  Object.assign(member, req.body);
  await settings.save();
  sendSuccess(res, member, 'Team member updated');
};

exports.removeMember = async (req, res) => {
  const { memberId } = req.params;
  const settings = await FirmSettings.findOne({ firmId: req.user._id });
  if (!settings) return sendError(res, 'Firm settings not found', 404);

  const member = settings.teamMembers.id(memberId);
  if (!member) return sendError(res, 'Team member not found', 404);

  member.deleteOne();
  await settings.save();
  sendSuccess(res, null, 'Team member removed');
};

exports.toggleMemberStatus = async (req, res) => {
  const { memberId } = req.params;
  const settings = await FirmSettings.findOne({ firmId: req.user._id });
  if (!settings) return sendError(res, 'Firm settings not found', 404);

  const member = settings.teamMembers.id(memberId);
  if (!member) return sendError(res, 'Team member not found', 404);

  member.status = member.status === 'active' ? 'inactive' : 'active';
  await settings.save();
  sendSuccess(res, member, `Member ${member.status}`);
};

/* ── Notifications ──────────────────────────────────────────────── */
exports.updateNotifications = async (req, res) => {
  const settings = await FirmSettings.findOneAndUpdate(
    { firmId: req.user._id },
    { notifications: req.body },
    { new: true, upsert: true }
  );
  sendSuccess(res, settings.notifications, 'Notification preferences updated');
};
