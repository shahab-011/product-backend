const Contact = require('../models/Contact.model');
const Matter  = require('../models/Matter.model');
const Lead    = require('../models/Lead.model');
const { sendSuccess, sendError } = require('../utils/response');

exports.check = async (req, res) => {
  const { name, email, phone } = req.query;
  if (!name && !email && !phone) return sendError(res, 'Provide at least name, email, or phone', 400);

  const nameRx  = name  ? new RegExp(name,  'i') : null;
  const emailRx = email ? new RegExp(email, 'i') : null;
  const phoneRx = phone ? new RegExp(phone.replace(/\D/g,''), 'i') : null;

  // Build contact filter
  const contactOr = [];
  if (nameRx)  contactOr.push({ firstName: nameRx }, { lastName: nameRx }, { company: nameRx });
  if (emailRx) contactOr.push({ email: emailRx });
  if (phoneRx) contactOr.push({ phone: phoneRx }, { mobile: phoneRx });

  // Build matter filter
  const matterOr = [];
  if (nameRx)  matterOr.push({ opposingParty: nameRx }, { opposingCounsel: nameRx }, { title: nameRx });
  if (emailRx) matterOr.push({ title: emailRx });

  // Build lead filter
  const leadOr = [];
  if (nameRx)  leadOr.push({ name: nameRx });
  if (emailRx) leadOr.push({ email: emailRx });

  const [contacts, matters, leads] = await Promise.all([
    contactOr.length > 0
      ? Contact.find({ firmId: req.user._id, $or: contactOr })
          .populate('relatedMatters', 'title matterNumber status').lean()
      : [],
    matterOr.length > 0
      ? Matter.find({ firmId: req.user._id, $or: matterOr })
          .select('title matterNumber opposingParty opposingCounsel status practiceArea clientId').lean()
      : [],
    leadOr.length > 0
      ? Lead.find({ firmId: req.user._id, $or: leadOr })
          .select('name email stage practiceArea convertedToMatterId').lean()
      : [],
  ]);

  // Conflict analysis
  const clientContacts   = contacts.filter(c => c.type === 'client');
  const opposingContacts = contacts.filter(c => ['opposing_party','opposing_counsel'].includes(c.type));
  const witnessContacts  = contacts.filter(c => c.type === 'witness');

  // Direct conflict: same entity is client in one matter AND opposing in another
  const directConflict = clientContacts.length > 0 && opposingContacts.length > 0;

  // Matter conflicts: name appears as opposing party in existing matters
  const matterConflicts = matters.filter(m =>
    (nameRx && (nameRx.test(m.opposingParty) || nameRx.test(m.opposingCounsel)))
  );

  const hasConflict = directConflict || matterConflicts.length > 0;
  const riskLevel   = hasConflict ? (directConflict ? 'high' : 'medium') : 'none';

  const conflictDetails = [];
  if (directConflict) {
    conflictDetails.push({
      type: 'DIRECT_CONFLICT',
      message: `"${name}" appears as both a client and an opposing party in your records.`,
      severity: 'high',
    });
  }
  matterConflicts.forEach(m => {
    conflictDetails.push({
      type: 'OPPOSING_PARTY_IN_MATTER',
      message: `"${name}" is listed as opposing party/counsel in matter: ${m.title} (${m.matterNumber || 'N/A'})`,
      severity: 'medium',
      matterId: m._id,
    });
  });

  sendSuccess(res, {
    query: { name, email, phone },
    hasConflict,
    riskLevel,
    conflictDetails,
    contacts,
    matters,
    leads,
    summary: {
      clientCount:   clientContacts.length,
      opposingCount: opposingContacts.length,
      witnessCount:  witnessContacts.length,
      matterCount:   matters.length,
      leadCount:     leads.length,
    },
  }, 'Conflict check complete');
};
