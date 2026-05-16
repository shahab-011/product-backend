const Contact = require('../models/Contact.model');
const Matter  = require('../models/Matter.model');
const Invoice = require('../models/Invoice.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = (req) => req.user.firmId || req.user._id;

/* ── List ─────────────────────────────────────────────────────── */
exports.list = async (req, res) => {
  const { type, isActive, tag, q, limit = 50, page = 1 } = req.query;
  const firmId = getFirmId(req);
  const filter = { firmId, isDeleted: { $ne: true } };
  if (type)                    filter.type = type;
  if (isActive !== undefined)  filter.isActive = isActive === 'true';
  if (tag)                     filter.tags = tag;
  if (q) {
    filter.$or = [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName:  { $regex: q, $options: 'i' } },
      { company:   { $regex: q, $options: 'i' } },
      { email:     { $regex: q, $options: 'i' } },
      { phone:     { $regex: q, $options: 'i' } },
      { mobile:    { $regex: q, $options: 'i' } },
      { barNumber: { $regex: q, $options: 'i' } },
      { tags:      { $regex: q, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
      .lean(),
    Contact.countDocuments(filter),
  ]);
  sendSuccess(res, { contacts, total, page: Number(page), limit: Number(limit) }, 'Contacts fetched');
};

/* ── Get (with related data) ──────────────────────────────────── */
exports.get = async (req, res) => {
  const firmId = getFirmId(req);
  const contact = await Contact.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } })
    .populate('relatedMatters', 'title matterNumber status practiceArea openDate billingType hourlyRate')
    .populate('linkedCompanyId', 'company firstName lastName')
    .lean();
  if (!contact) return sendError(res, 'Contact not found', 404);
  sendSuccess(res, contact, 'Contact fetched');
};

/* ── Create ───────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  const contact = await Contact.create({ ...req.body, firmId: getFirmId(req) });
  sendSuccess(res, contact, 'Contact created', 201);
};

/* ── Update ───────────────────────────────────────────────────── */
exports.update = async (req, res) => {
  const { isDeleted, firmId: _firmId, ...body } = req.body;
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req), isDeleted: { $ne: true } },
    { ...body, lastContactDate: new Date() },
    { new: true, runValidators: true }
  );
  if (!contact) return sendError(res, 'Contact not found', 404);
  sendSuccess(res, contact, 'Contact updated');
};

/* ── Soft delete ──────────────────────────────────────────────── */
exports.remove = async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { isDeleted: true },
    { new: true }
  );
  if (!contact) return sendError(res, 'Contact not found', 404);
  sendSuccess(res, null, 'Contact deleted');
};

/* ── Merge contacts ───────────────────────────────────────────── */
exports.mergeContacts = async (req, res) => {
  const { secondaryId } = req.body;
  const primaryId = req.params.id;
  const firmId    = getFirmId(req);

  if (primaryId === secondaryId) return sendError(res, 'Cannot merge a contact with itself', 400);

  const [primary, secondary] = await Promise.all([
    Contact.findOne({ _id: primaryId,   firmId, isDeleted: { $ne: true } }),
    Contact.findOne({ _id: secondaryId, firmId, isDeleted: { $ne: true } }),
  ]);
  if (!primary || !secondary) return sendError(res, 'One or both contacts not found', 404);

  // Merge scalar fields: fill primary gaps from secondary
  const mergeFields = [
    'email','alternateEmail','phone','mobile','fax','company','jobTitle',
    'website','linkedIn','taxId','barNumber','dateOfBirth','gender',
    'preferredLanguage','preferredContactMethod','notes','ledesClientId',
    'billingRate','lastContactDate',
  ];
  for (const f of mergeFields) {
    if (!primary[f] && secondary[f]) primary[f] = secondary[f];
  }

  // Merge arrays
  primary.tags      = [...new Set([...primary.tags, ...secondary.tags])];
  primary.addresses = [...primary.addresses, ...secondary.addresses.filter(sa =>
    !primary.addresses.some(pa => pa.street === sa.street)
  )];
  const existingMatterIds = primary.relatedMatters.map(id => id.toString());
  secondary.relatedMatters.forEach(id => {
    if (!existingMatterIds.includes(id.toString())) primary.relatedMatters.push(id);
  });

  await primary.save();

  // Re-link all related records to primary
  await Promise.all([
    Matter.updateMany(
      { firmId, $or: [{ clientId: secondaryId }, { coClients: secondaryId }] },
      [{ $set: {
        clientId:  { $cond: [{ $eq: ['$clientId', secondary._id] }, primary._id, '$clientId'] },
        coClients: { $map: { input: '$coClients', as: 'c', in: { $cond: [{ $eq: ['$$c', secondary._id] }, primary._id, '$$c'] } } },
      }}]
    ),
    Invoice.updateMany({ firmId, clientId: secondaryId }, { clientId: primaryId }),
    Contact.findByIdAndUpdate(secondaryId, { isDeleted: true }),
  ]);

  sendSuccess(res, primary, 'Contacts merged');
};

/* ── List potential duplicates ────────────────────────────────── */
exports.listDuplicates = async (req, res) => {
  const firmId   = getFirmId(req);
  const contacts = await Contact.find({ firmId, isDeleted: { $ne: true } })
    .select('firstName lastName company email phone').lean();

  const duplicates = [];
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i], b = contacts[j];
      const reasons = [];
      if (a.email && b.email && a.email === b.email) reasons.push('same email');
      if (a.phone && b.phone && a.phone === b.phone) reasons.push('same phone');
      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
      if (nameA && nameB && nameA === nameB) reasons.push('same name');
      if (reasons.length) duplicates.push({ contact1: a, contact2: b, reasons });
    }
  }
  sendSuccess(res, duplicates, 'Potential duplicates found');
};

/* ── Activity timeline ────────────────────────────────────────── */
exports.getTimeline = async (req, res) => {
  const firmId    = getFirmId(req);
  const contactId = req.params.id;

  const contact = await Contact.findOne({ _id: contactId, firmId })
    .populate('relatedMatters', 'title matterNumber status openDate createdAt')
    .lean();
  if (!contact) return sendError(res, 'Contact not found', 404);

  const [invoices] = await Promise.all([
    Invoice.find({ firmId, clientId: contactId })
      .select('invoiceNumber total status issueDate createdAt').lean(),
  ]);

  const events = [];

  events.push({
    type: 'created', date: contact.createdAt, icon: 'user',
    title: 'Contact added', description: `${contact.fullName} added to contacts`,
  });

  (contact.relatedMatters || []).forEach(m => {
    events.push({
      type: 'matter', date: m.openDate || m.createdAt, icon: 'briefcase',
      title: 'Matter linked', description: `${m.title} (${m.matterNumber || ''})`, refId: m._id,
    });
  });

  invoices.forEach(inv => {
    events.push({
      type: 'invoice', date: inv.issueDate || inv.createdAt, icon: 'receipt',
      title: `Invoice ${inv.status}`, description: `${inv.invoiceNumber} — $${inv.total?.toFixed(2) || '0.00'}`, refId: inv._id,
    });
  });

  if (contact.lastContactDate) {
    events.push({
      type: 'contact', date: contact.lastContactDate, icon: 'phone',
      title: 'Last contacted', description: 'Record updated',
    });
  }

  events.sort((a, b) => new Date(b.date) - new Date(a.date));
  sendSuccess(res, events, 'Timeline fetched');
};

/* ── Financial summary ────────────────────────────────────────── */
exports.getFinancials = async (req, res) => {
  const firmId    = getFirmId(req);
  const contactId = req.params.id;

  const contact = await Contact.findOne({ _id: contactId, firmId }).lean();
  if (!contact) return sendError(res, 'Contact not found', 404);

  const invoices = await Invoice.find({ firmId, clientId: contactId }).lean();

  const totalBilled    = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalCollected = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const outstanding    = totalBilled - totalCollected;
  const overdueCount   = invoices.filter(i => i.status === 'overdue').length;

  sendSuccess(res, {
    totalBilled, totalCollected, outstanding, overdueCount,
    invoiceCount: invoices.length,
    invoices,
  }, 'Financials fetched');
};

/* ── Export CSV ───────────────────────────────────────────────── */
exports.exportToCSV = async (req, res) => {
  const firmId   = getFirmId(req);
  const contacts = await Contact.find({ firmId, isDeleted: { $ne: true } }).lean();

  const headers = [
    'firstName','lastName','company','type','email','alternateEmail',
    'phone','mobile','fax','jobTitle','barNumber','taxId',
    'website','linkedIn','preferredLanguage','preferredContactMethod',
    'tags','notes','isActive','createdAt',
  ];

  const escapeCSV = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = contacts.map(c =>
    headers.map(h => {
      if (h === 'tags') return escapeCSV((c.tags || []).join(';'));
      return escapeCSV(c[h]);
    }).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  res.send(csv);
};

/* ── Import CSV ───────────────────────────────────────────────── */
exports.importFromCSV = async (req, res) => {
  if (!req.file) return sendError(res, 'CSV file required', 400);
  const firmId = getFirmId(req);

  const csv  = req.file.buffer.toString('utf-8');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return sendError(res, 'CSV file is empty or missing headers', 400);

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const results = { created: 0, skipped: 0, errors: [] };

  const docs = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    const email = row.email || row.Email || row.EMAIL;
    if (!row.firstName && !row.first_name && !row.company && !email) {
      results.skipped++;
      continue;
    }

    docs.push({
      firmId,
      firstName: row.firstName || row.first_name || '',
      lastName:  row.lastName  || row.last_name  || '',
      company:   row.company   || row.Company    || '',
      email:     email || '',
      phone:     row.phone     || row.Phone      || '',
      mobile:    row.mobile    || '',
      type:      row.type      || 'client',
      jobTitle:  row.jobTitle  || row.job_title  || '',
      notes:     row.notes     || row.Notes      || '',
      tags:      row.tags ? row.tags.split(';').map(t => t.trim()).filter(Boolean) : [],
      importSource: 'csv',
      importedAt: new Date(),
    });
  }

  if (docs.length) {
    try {
      const inserted = await Contact.insertMany(docs, { ordered: false });
      results.created = inserted.length;
    } catch (err) {
      results.created = err.result?.nInserted || 0;
      results.errors.push(err.message);
    }
  }

  sendSuccess(res, results, `Import complete: ${results.created} contacts created`);
};

/* ── Conflict check ───────────────────────────────────────────── */
exports.conflictCheck = async (req, res) => {
  const { name, email } = req.query;
  if (!name && !email) return sendError(res, 'name or email required', 400);
  const firmId = getFirmId(req);

  const nameRegex  = name  ? new RegExp(name.trim(), 'i') : null;
  const emailRegex = email ? new RegExp(email.trim(), 'i') : null;

  const orFilter = [];
  if (nameRegex)  orFilter.push({ firstName: nameRegex }, { lastName: nameRegex }, { company: nameRegex });
  if (emailRegex) orFilter.push({ email: emailRegex });

  const [contacts, matters] = await Promise.all([
    Contact.find({ firmId, isDeleted: { $ne: true }, $or: orFilter }).lean(),
    Matter.find({
      firmId,
      isDeleted: { $ne: true },
      ...(nameRegex ? { $or: [{ opposingParty: nameRegex }, { opposingCounsel: nameRegex }, { title: nameRegex }] } : {}),
    }).select('title matterNumber opposingParty opposingCounsel status').lean(),
  ]);

  const clientRoles   = contacts.filter(c => c.type === 'client');
  const opposingRoles = contacts.filter(c => ['opposing_party','opposing_counsel'].includes(c.type));
  const directConflict = clientRoles.length > 0 && opposingRoles.length > 0;

  const riskLevel = directConflict ? 'high'
    : opposingRoles.length > 0 ? 'medium'
    : contacts.length > 0 ? 'low'
    : 'none';

  const matterConflicts = matters.filter(m =>
    (nameRegex && (nameRegex.test(m.opposingParty) || nameRegex.test(m.opposingCounsel)))
  );

  sendSuccess(res, {
    riskLevel, directConflict, contacts, matters, matterConflicts,
    query: { name, email },
  }, 'Conflict check complete');
};
