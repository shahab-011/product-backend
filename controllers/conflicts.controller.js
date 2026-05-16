const Contact          = require('../models/Contact.model');
const Matter           = require('../models/Matter.model');
const Lead             = require('../models/Lead.model');
const CommunicationLog = require('../models/CommunicationLog.model');
const ConflictCheck    = require('../models/ConflictCheck.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

function buildRegexes(searchTerms) {
  const rx = { name: [], email: [], phone: [], company: [] };
  for (const { type, value } of searchTerms) {
    if (!value || !value.trim()) continue;
    const cleaned = type === 'phone' ? value.replace(/\D/g, '') : value.trim();
    if (cleaned) rx[type] = (rx[type] || []).concat(new RegExp(cleaned, 'i'));
  }
  return rx;
}

exports.runConflictCheck = async (req, res) => {
  const firmId = getFirmId(req);
  const { searchTerms = [], matterId, notes } = req.body;

  if (!searchTerms.length || !searchTerms.some(t => t.value && t.value.trim())) {
    return sendError(res, 'Provide at least one search term', 400);
  }

  const rx = buildRegexes(searchTerms);

  const contactOr = [];
  rx.name.forEach(r    => contactOr.push({ firstName: r }, { lastName: r }, { company: r }));
  rx.company.forEach(r => contactOr.push({ company: r }));
  rx.email.forEach(r   => contactOr.push({ email: r }, { alternateEmail: r }));
  rx.phone.forEach(r   => contactOr.push({ phone: r }, { mobile: r }));

  const matterOr = [];
  rx.name.forEach(r    => matterOr.push({ title: r }, { opposingParty: r }, { opposingCounsel: r }));
  rx.company.forEach(r => matterOr.push({ opposingParty: r }, { opposingCounsel: r }));

  const leadOr = [];
  rx.name.forEach(r  => leadOr.push({ name: r }));
  rx.email.forEach(r => leadOr.push({ email: r }));

  const commOr = [];
  rx.name.forEach(r  => commOr.push({ contact: r }, { subject: r }));
  rx.email.forEach(r => commOr.push({ contact: r }));

  const [contacts, matters, leads, commMatches] = await Promise.all([
    contactOr.length
      ? Contact.find({ firmId, $or: contactOr }).lean()
      : [],
    matterOr.length
      ? Matter.find({ firmId, $or: matterOr })
          .select('title matterNumber opposingParty opposingCounsel status practiceArea').lean()
      : [],
    leadOr.length
      ? Lead.find({ firmId, isDeleted: { $ne: true }, $or: leadOr })
          .select('name email stage practiceArea').lean()
      : [],
    commOr.length
      ? CommunicationLog.find({ firmId, isDeleted: { $ne: true }, $or: commOr })
          .select('type subject contact date matterId').limit(20).lean()
      : [],
  ]);

  /* ── 7-point conflict analysis ─────────────────────────────────── */
  const conflictDetails = [];

  const clientContacts   = contacts.filter(c => c.type === 'client');
  const opposingContacts = contacts.filter(c => ['opposing_party', 'opposing_counsel'].includes(c.type));
  const witnesses        = contacts.filter(c => c.type === 'witness');
  const experts          = contacts.filter(c => c.type === 'expert');

  // 1. DIRECT_CONFLICT
  if (clientContacts.length > 0 && opposingContacts.length > 0) {
    conflictDetails.push({
      type: 'DIRECT_CONFLICT',
      description: 'Entity appears as both a client and an opposing party in your records.',
      severity: 'high',
    });
  }

  // 2. OPPOSING_PARTY
  const matterConflictIds = new Set();
  matters.forEach(m => {
    const isOpposing =
      rx.name.some(r    => (m.opposingParty && r.test(m.opposingParty)) || (m.opposingCounsel && r.test(m.opposingCounsel))) ||
      rx.company.some(r => (m.opposingParty && r.test(m.opposingParty)));
    if (isOpposing) {
      matterConflictIds.add(String(m._id));
      conflictDetails.push({
        type: 'OPPOSING_PARTY',
        description: `Entity is opposing party/counsel in matter: "${m.title}" (${m.matterNumber || 'N/A'})`,
        severity: 'high',
        relatedMatterId: m._id,
      });
    }
  });

  // 3. FORMER_CLIENT
  const formerClients = contacts.filter(c => c.type === 'client' && c.status === 'inactive');
  if (formerClients.length > 0) {
    conflictDetails.push({
      type: 'FORMER_CLIENT',
      description: `Entity was a former client (${formerClients.map(c => `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.company).join(', ')}).`,
      severity: 'medium',
    });
  }

  // 4. EXISTING_CLIENT
  if (clientContacts.length > 0 && opposingContacts.length === 0) {
    conflictDetails.push({
      type: 'EXISTING_CLIENT',
      description: `Entity is an existing client. Verify the new matter does not conflict with their interests.`,
      severity: 'low',
    });
  }

  // 5. WITNESS_EXPERT
  if (witnesses.length > 0 || experts.length > 0) {
    conflictDetails.push({
      type: 'WITNESS_EXPERT',
      description: `Entity appears as a witness or expert in existing matters.`,
      severity: 'medium',
    });
  }

  // 6. LEAD_MATCH
  if (leads.length > 0) {
    conflictDetails.push({
      type: 'LEAD_MATCH',
      description: `Entity matches ${leads.length} lead(s) in your intake pipeline.`,
      severity: 'low',
    });
  }

  // 7. COMMUNICATION_MENTION
  if (commMatches.length > 0) {
    conflictDetails.push({
      type: 'COMMUNICATION_MENTION',
      description: `Entity is mentioned in ${commMatches.length} communication log(s).`,
      severity: 'low',
    });
  }

  const hasConflict = conflictDetails.some(d => ['high', 'medium'].includes(d.severity));
  const riskLevel   = conflictDetails.some(d => d.severity === 'high')   ? 'high'
                    : conflictDetails.some(d => d.severity === 'medium') ? 'medium'
                    : conflictDetails.some(d => d.severity === 'low')    ? 'low'
                    : 'none';

  const check = await ConflictCheck.create({
    firmId,
    performedBy: req.user._id,
    matterId:    matterId || undefined,
    searchTerms,
    notes:       notes || undefined,
    status:      hasConflict ? 'conflict_found' : 'clear',
    hasConflict,
    riskLevel,
    conflictDetails,
    results: {
      contacts: contacts.map(c => ({
        contactId: c._id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.company || '',
        role: c.type,
        riskLevel: ['opposing_party', 'opposing_counsel'].includes(c.type) ? 'high' : 'low',
      })),
      matters: matters.map(m => ({
        matterId:     m._id,
        title:        m.title,
        matterNumber: m.matterNumber,
        role:         matterConflictIds.has(String(m._id)) ? 'opposing' : 'related',
        status:       m.status,
        riskLevel:    matterConflictIds.has(String(m._id)) ? 'high' : 'low',
      })),
      leads: leads.map(l => ({ leadId: l._id, name: l.name, email: l.email, riskLevel: 'low' })),
    },
  });

  sendSuccess(res, { check, contacts, matters, leads, commMatches }, 'Conflict check complete', 201);
};

exports.listConflictChecks = async (req, res) => {
  const firmId = getFirmId(req);
  const { from, to, q, hasConflict, limit = 50, page = 1 } = req.query;
  const filter = { firmId };

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to)   filter.createdAt.$lte = new Date(to);
  }
  if (q)           filter['searchTerms.value'] = { $regex: q, $options: 'i' };
  if (hasConflict) filter.hasConflict = hasConflict === 'true';

  const skip = (Number(page) - 1) * Number(limit);
  const [checks, total] = await Promise.all([
    ConflictCheck.find(filter)
      .populate('performedBy', 'name email')
      .populate('matterId', 'title matterNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ConflictCheck.countDocuments(filter),
  ]);

  sendSuccess(res, { checks, total, page: Number(page) }, 'Conflict check history fetched');
};

exports.getConflictCheckReport = async (req, res) => {
  const check = await ConflictCheck.findOne({ _id: req.params.id, firmId: getFirmId(req) })
    .populate('performedBy', 'name email')
    .populate('matterId', 'title matterNumber')
    .populate('waivedBy', 'name email')
    .lean();
  if (!check) return sendError(res, 'Conflict check not found', 404);
  sendSuccess(res, check, 'Conflict check report fetched');
};

exports.resolveConflict = async (req, res) => {
  const { resolution, resolutionNotes } = req.body;
  if (!resolution) return sendError(res, 'Resolution is required', 400);

  const check = await ConflictCheck.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { resolution, resolutionNotes, status: resolution === 'waived' ? 'waivable' : 'clear' },
    { new: true, runValidators: true }
  );
  if (!check) return sendError(res, 'Conflict check not found', 404);
  sendSuccess(res, check, 'Conflict resolved');
};

exports.createWaiver = async (req, res) => {
  const { waiverDocumentId, notes } = req.body;
  const check = await ConflictCheck.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    {
      resolution:       'waived',
      resolutionNotes:  notes || undefined,
      waiverDocumentId: waiverDocumentId || undefined,
      waivedBy:         req.user._id,
      waivedAt:         new Date(),
      status:           'waivable',
    },
    { new: true }
  );
  if (!check) return sendError(res, 'Conflict check not found', 404);
  sendSuccess(res, check, 'Conflict waiver recorded');
};
