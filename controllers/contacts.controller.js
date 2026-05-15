const Contact = require('../models/Contact.model');
const Matter  = require('../models/Matter.model');
const { sendSuccess, sendError } = require('../utils/response');

exports.list = async (req, res) => {
  const { type, q, isActive, limit = 50, page = 1 } = req.query;
  const filter = { firmId: req.user._id };
  if (type)              filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (q) {
    filter.$or = [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName:  { $regex: q, $options: 'i' } },
      { company:   { $regex: q, $options: 'i' } },
      { email:     { $regex: q, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [contacts, total] = await Promise.all([
    Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Contact.countDocuments(filter),
  ]);
  sendSuccess(res, { contacts, total, page: Number(page), limit: Number(limit) }, 'Contacts fetched');
};

exports.get = async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('relatedMatters', 'title matterNumber status practiceArea')
    .lean();
  if (!contact) return sendError(res, 'Contact not found', 404);
  sendSuccess(res, contact, 'Contact fetched');
};

exports.create = async (req, res) => {
  const contact = await Contact.create({ ...req.body, firmId: req.user._id });
  sendSuccess(res, contact, 'Contact created', 201);
};

exports.update = async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!contact) return sendError(res, 'Contact not found', 404);
  sendSuccess(res, contact, 'Contact updated');
};

exports.remove = async (req, res) => {
  const contact = await Contact.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!contact) return sendError(res, 'Contact not found', 404);
  sendSuccess(res, null, 'Contact deleted');
};

// Conflict check: search contacts + matters for same name/email
exports.conflictCheck = async (req, res) => {
  const { name, email } = req.query;
  if (!name && !email) return sendError(res, 'name or email required', 400);

  const nameRegex  = name  ? new RegExp(name, 'i') : null;
  const emailRegex = email ? new RegExp(email, 'i') : null;

  const orFilter = [];
  if (nameRegex)  orFilter.push({ firstName: nameRegex }, { lastName: nameRegex }, { company: nameRegex });
  if (emailRegex) orFilter.push({ email: emailRegex });

  const [contacts, matters] = await Promise.all([
    Contact.find({ firmId: req.user._id, $or: orFilter }).lean(),
    Matter.find({
      firmId: req.user._id,
      $or: nameRegex ? [
        { opposingParty: nameRegex },
        { opposingCounsel: nameRegex },
        { title: nameRegex },
      ] : [{ title: /^/ }],  // empty match if no name
    }).select('title matterNumber opposingParty opposingCounsel clientId status').lean(),
  ]);

  // Detect conflict: same name appears as client AND opposing party
  const clientRoles   = contacts.filter(c => c.type === 'client');
  const opposingRoles = contacts.filter(c => c.type === 'opposing_party');
  const hasConflict   = clientRoles.length > 0 && opposingRoles.length > 0;

  sendSuccess(res, { contacts, matters, hasConflict, query: { name, email } }, 'Conflict check complete');
};
