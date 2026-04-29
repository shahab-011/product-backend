const Case = require('../models/Case.model');
const Document = require('../models/Document.model');
const Alert = require('../models/Alert.model');
const { sendSuccess, sendError } = require('../utils/response');

/* ── Dashboard stats ───────────────────────────────────────────────── */

exports.getDashboard = async (req, res, next) => {
  try {
    const lawyerId = req.user._id;

    const [totalCases, activeCases, pendingCases, closedCases, totalDocs, unreadAlerts, recentCases] =
      await Promise.all([
        Case.countDocuments({ lawyerId }),
        Case.countDocuments({ lawyerId, status: 'active' }),
        Case.countDocuments({ lawyerId, status: 'pending' }),
        Case.countDocuments({ lawyerId, status: 'closed' }),
        Document.countDocuments({ userId: lawyerId }),
        Alert.countDocuments({ userId: lawyerId, isRead: false }),
        Case.find({ lawyerId }).sort({ updatedAt: -1 }).limit(5).lean(),
      ]);

    return sendSuccess(res, {
      stats: { totalCases, activeCases, pendingCases, closedCases, totalDocs, unreadAlerts },
      recentCases,
    }, 'Lawyer dashboard fetched');
  } catch (err) {
    next(err);
  }
};

/* ── Cases CRUD ────────────────────────────────────────────────────── */

exports.getCases = async (req, res, next) => {
  try {
    const filter = { lawyerId: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const cases = await Case.find(filter).sort({ updatedAt: -1 }).lean();
    return sendSuccess(res, { cases, total: cases.length }, 'Cases fetched');
  } catch (err) {
    next(err);
  }
};

exports.getCase = async (req, res, next) => {
  try {
    const found = await Case.findOne({ _id: req.params.id, lawyerId: req.user._id });
    if (!found) return sendError(res, 'Case not found', 404);
    return sendSuccess(res, { case: found }, 'Case fetched');
  } catch (err) {
    next(err);
  }
};

exports.createCase = async (req, res, next) => {
  try {
    const { title, clientName, clientEmail, caseType, description, notes, status, priority } = req.body;

    if (!title || !clientName || !clientEmail) {
      return sendError(res, 'title, clientName, and clientEmail are required', 400);
    }

    const newCase = await Case.create({
      lawyerId: req.user._id,
      title, clientName, clientEmail, caseType, description, notes,
      status:   status   || 'active',
      priority: priority || 'medium',
    });

    return sendSuccess(res, { case: newCase }, 'Case created', 201);
  } catch (err) {
    next(err);
  }
};

exports.updateCase = async (req, res, next) => {
  try {
    const { title, clientName, clientEmail, caseType, description, notes, status, priority } = req.body;

    const update = { title, clientName, clientEmail, caseType, description, notes, priority };
    if (status) {
      update.status = status;
      if (status === 'closed') update.closedAt = new Date();
    }

    const found = await Case.findOneAndUpdate(
      { _id: req.params.id, lawyerId: req.user._id },
      update,
      { new: true, runValidators: true }
    );

    if (!found) return sendError(res, 'Case not found', 404);
    return sendSuccess(res, { case: found }, 'Case updated');
  } catch (err) {
    next(err);
  }
};

exports.deleteCase = async (req, res, next) => {
  try {
    const found = await Case.findOneAndDelete({ _id: req.params.id, lawyerId: req.user._id });
    if (!found) return sendError(res, 'Case not found', 404);
    return sendSuccess(res, null, 'Case deleted');
  } catch (err) {
    next(err);
  }
};

/* ── Clients (derived from unique emails across cases) ─────────────── */

exports.getClients = async (req, res, next) => {
  try {
    const cases = await Case.find({ lawyerId: req.user._id }).lean();

    // Group cases by clientEmail → one entry per unique client
    const clientMap = new Map();
    for (const c of cases) {
      const key = c.clientEmail;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          name:        c.clientName,
          email:       c.clientEmail,
          totalCases:  0,
          activeCases: 0,
          cases:       [],
        });
      }
      const entry = clientMap.get(key);
      entry.totalCases++;
      if (c.status === 'active') entry.activeCases++;
      entry.cases.push({ id: c._id, title: c.title, status: c.status, priority: c.priority });
    }

    const clients = Array.from(clientMap.values());
    return sendSuccess(res, { clients, total: clients.length }, 'Clients fetched');
  } catch (err) {
    next(err);
  }
};
