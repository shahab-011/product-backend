const Matter           = require('../models/Matter.model');
const Contact          = require('../models/Contact.model');
const Invoice          = require('../models/Invoice.model');
const Task             = require('../models/Task.model');
const CalendarEvent    = require('../models/CalendarEvent.model');
const CommunicationLog = require('../models/CommunicationLog.model');
const AuditLog         = require('../models/AuditLog.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

/* ── Highlight helper — wraps matched substring in <mark> ──────────── */
function highlight(text, q) {
  if (!text || !q) return text;
  try {
    return String(text).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      m => `<mark>${m}</mark>`
    );
  } catch { return text; }
}

function excerpt(text, q, len = 120) {
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text.slice(0, len);
  const start = Math.max(0, idx - 40);
  return (start > 0 ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '');
}

/* ── Main search ─────────────────────────────────────────────────────── */
exports.globalSearch = async (req, res) => {
  const { q, types, limit = 5 } = req.query;
  if (!q || q.trim().length < 2) return sendError(res, 'Query must be at least 2 characters', 400);

  const firmId = getFirmId(req);
  const rx     = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const lim    = Math.min(Number(limit) || 5, 20);
  const want   = types ? types.split(',') : ['matters','contacts','invoices','tasks','events','comms'];

  const results = {};
  const jobs    = [];

  if (want.includes('matters')) {
    jobs.push(
      Matter.find({ firmId, isDeleted: { $ne: true }, $or: [{ title: rx }, { matterNumber: rx }, { description: rx }] })
        .select('title matterNumber status practiceArea clientId').populate('clientId','firstName lastName')
        .limit(lim).lean()
        .then(docs => {
          results.matters = docs.map(d => ({
            _id: d._id, type: 'matter',
            title:    highlight(d.title, q),
            sub:      `${d.matterNumber} · ${d.status}`,
            excerpt:  excerpt(d.description, q),
            link:     `/matters/${d._id}`,
            icon:     '⚖️',
          }));
        })
    );
  }

  if (want.includes('contacts')) {
    jobs.push(
      Contact.find({ firmId, isDeleted: { $ne: true }, $or: [{ firstName: rx }, { lastName: rx }, { email: rx }, { company: rx }, { phone: rx }] })
        .select('firstName lastName email company phone contactType').limit(lim).lean()
        .then(docs => {
          results.contacts = docs.map(d => ({
            _id: d._id, type: 'contact',
            title:    highlight(`${d.firstName || ''} ${d.lastName || ''}`.trim() || d.company || d.email, q),
            sub:      [d.email, d.company, d.contactType].filter(Boolean).join(' · '),
            link:     `/contacts/${d._id}`,
            icon:     '👤',
          }));
        })
    );
  }

  if (want.includes('invoices')) {
    jobs.push(
      Invoice.find({ firmId, isDeleted: { $ne: true }, $or: [{ invoiceNumber: rx }, { notes: rx }] })
        .select('invoiceNumber status total amountDue matterId').populate('matterId','title')
        .limit(lim).lean()
        .then(docs => {
          results.invoices = docs.map(d => ({
            _id: d._id, type: 'invoice',
            title:    highlight(d.invoiceNumber, q),
            sub:      `${d.status} · $${d.total?.toFixed(2)}${d.matterId ? ' · ' + d.matterId.title : ''}`,
            link:     `/billing`,
            icon:     '🧾',
          }));
        })
    );
  }

  if (want.includes('tasks')) {
    jobs.push(
      Task.find({ firmId, isDeleted: { $ne: true }, $or: [{ title: rx }, { description: rx }] })
        .select('title status priority dueDate matterId').populate('matterId','title')
        .limit(lim).lean()
        .then(docs => {
          results.tasks = docs.map(d => ({
            _id: d._id, type: 'task',
            title:    highlight(d.title, q),
            sub:      `${d.status} · ${d.priority} priority${d.matterId ? ' · ' + d.matterId.title : ''}`,
            excerpt:  excerpt(d.description, q),
            link:     `/tasks`,
            icon:     '✓',
          }));
        })
    );
  }

  if (want.includes('events')) {
    jobs.push(
      CalendarEvent.find({ firmId, $or: [{ title: rx }, { notes: rx }, { location: rx }] })
        .select('title startTime eventType location').limit(lim).lean()
        .then(docs => {
          results.events = docs.map(d => ({
            _id: d._id, type: 'event',
            title:    highlight(d.title, q),
            sub:      `${d.eventType} · ${d.startTime ? new Date(d.startTime).toLocaleDateString() : ''}`,
            link:     `/cal`,
            icon:     '📅',
          }));
        })
    );
  }

  if (want.includes('comms')) {
    jobs.push(
      CommunicationLog.find({ firmId, isDeleted: { $ne: true }, $or: [{ subject: rx }, { summary: rx }, { contact: rx }] })
        .select('subject summary type date contact').limit(lim).lean()
        .then(docs => {
          results.comms = docs.map(d => ({
            _id: d._id, type: 'communication',
            title:    highlight(d.subject || d.summary || 'Communication', q),
            sub:      `${d.type} · ${d.date ? new Date(d.date).toLocaleDateString() : ''}${d.contact ? ' · ' + d.contact : ''}`,
            excerpt:  excerpt(d.summary, q),
            link:     `/communications`,
            icon:     '💬',
          }));
        })
    );
  }

  await Promise.all(jobs);

  // Flatten and rank — items with title match rank higher than body matches
  const flat = Object.values(results).flat().sort((a, b) => {
    const aTitle = a.title?.toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    const bTitle = b.title?.toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    return aTitle - bTitle;
  });

  sendSuccess(res, { query: q, results, flat: flat.slice(0, 25), total: flat.length }, 'Search complete');
};

/* ── Audit log list (admin only) ─────────────────────────────────────── */
exports.getAuditLog = async (req, res) => {
  const { userId, from, to, method, page = 1, limit = 50 } = req.query;
  const firmId  = getFirmId(req);
  const filter  = { firmId };
  if (userId) filter.userId = userId;
  if (method) filter.method = method;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to)   filter.createdAt.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    AuditLog.countDocuments(filter),
  ]);

  sendSuccess(res, { logs, total, page: Number(page) }, 'Audit log fetched');
};
