const ClientLink = require('../models/ClientLink.model');
const Case       = require('../models/Case.model');
const User       = require('../models/User.model');
const Document   = require('../models/Document.model');
const Analysis   = require('../models/Analysis.model');
const Alert      = require('../models/Alert.model');
const { sendSuccess, sendError } = require('../utils/response');

/* ── Dashboard ─────────────────────────────────────────────────────── */

exports.getDashboard = async (req, res, next) => {
  try {
    const lawyerId = req.user._id;

    const [totalCases, activeCases, pendingCases, closedCases,
           totalDocs, unreadAlerts, recentCases,
           linkedClients, pendingLinks] = await Promise.all([
      Case.countDocuments({ lawyerId }),
      Case.countDocuments({ lawyerId, status: { $in: ['active', 'in_review'] } }),
      Case.countDocuments({ lawyerId, status: 'pending' }),
      Case.countDocuments({ lawyerId, status: { $in: ['closed', 'completed', 'archived'] } }),
      Document.countDocuments({ userId: lawyerId }),
      Alert.countDocuments({ userId: lawyerId, isRead: false }),
      Case.find({ lawyerId }).sort({ updatedAt: -1 }).limit(5)
        .populate('clientId', 'name email').lean(),
      ClientLink.countDocuments({ lawyerId, status: 'accepted' }),
      ClientLink.countDocuments({ lawyerId, status: 'pending' }),
    ]);

    return sendSuccess(res, {
      stats: {
        totalCases, activeCases, pendingCases, closedCases,
        totalDocs, unreadAlerts, linkedClients, pendingLinks,
      },
      recentCases,
    }, 'Lawyer dashboard fetched');
  } catch (err) {
    next(err);
  }
};

/* ── CLIENT LINKING ────────────────────────────────────────────────── */

// Lawyer sends a link request to a client by email
exports.sendLinkRequest = async (req, res, next) => {
  try {
    const { clientEmail, message } = req.body;

    if (!clientEmail) return sendError(res, 'Client email is required', 400);

    if (clientEmail.toLowerCase() === req.user.email) {
      return sendError(res, 'You cannot send a link request to yourself', 400);
    }

    const existing = await ClientLink.findOne({
      lawyerId: req.user._id,
      clientEmail: clientEmail.toLowerCase(),
      status: { $in: ['pending', 'accepted'] },
    });

    if (existing) {
      return sendError(res,
        existing.status === 'pending'
          ? 'A link request is already pending for this client'
          : 'You are already linked to this client',
        400
      );
    }

    const clientUser = await User.findOne({ email: clientEmail.toLowerCase() });

    const linkRequest = await ClientLink.create({
      lawyerId:    req.user._id,
      clientId:    clientUser ? clientUser._id : null,
      clientEmail: clientEmail.toLowerCase(),
      message:     message || '',
      status:      'pending',
    });

    if (clientUser) {
      await Alert.create({
        userId:    clientUser._id,
        alertType: 'info',
        title:     `Lawyer ${req.user.name} wants to link with you`,
        message:   `${req.user.name} has sent you a link request. Once accepted, they can view documents you choose to share. Message: "${message || 'No message provided'}"`,
        severity:  'info',
      });
    }

    return sendSuccess(res, { linkRequest },
      clientUser
        ? 'Link request sent. Client will be notified.'
        : 'Link request created. Client will be notified when they register.',
      201
    );
  } catch (err) {
    next(err);
  }
};

// Get all clients linked to this lawyer
exports.getLinkedClients = async (req, res, next) => {
  try {
    const links = await ClientLink.find({ lawyerId: req.user._id })
      .populate('clientId', 'name email plan createdAt lastLogin')
      .sort({ createdAt: -1 });

    const clientsWithStats = await Promise.all(
      links.map(async (link) => {
        const obj = link.toObject();
        if (link.clientId && link.status === 'accepted') {
          const [docCount, caseCount] = await Promise.all([
            Document.countDocuments({ userId: link.clientId._id }),
            Case.countDocuments({ lawyerId: req.user._id, clientId: link.clientId._id }),
          ]);
          obj.stats = {
            totalDocuments:  docCount,
            sharedDocuments: link.sharedDocuments.length,
            totalCases:      caseCount,
          };
        }
        return obj;
      })
    );

    return sendSuccess(res, {
      clients:  clientsWithStats,
      accepted: clientsWithStats.filter(l => l.status === 'accepted').length,
      pending:  clientsWithStats.filter(l => l.status === 'pending').length,
      total:    links.length,
    }, 'Clients fetched successfully');
  } catch (err) {
    next(err);
  }
};

// Get documents shared with lawyer by a specific client
exports.getClientDocuments = async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const link = await ClientLink.findOne({
      lawyerId: req.user._id,
      clientId,
      status:   'accepted',
    });

    if (!link) return sendError(res, 'You are not linked to this client or link not accepted', 403);

    const documents = await Document.find({ _id: { $in: link.sharedDocuments } })
      .select('-extractedText');

    return sendSuccess(res, { documents, total: documents.length }, 'Client documents fetched');
  } catch (err) {
    next(err);
  }
};

// Lawyer removes a client link
exports.unlinkClient = async (req, res, next) => {
  try {
    const link = await ClientLink.findOneAndUpdate(
      { _id: req.params.linkId, lawyerId: req.user._id },
      { status: 'unlinked' },
      { new: true }
    );

    if (!link) return sendError(res, 'Link not found', 404);

    return sendSuccess(res, {}, 'Client unlinked successfully');
  } catch (err) {
    next(err);
  }
};

/* ── CLIENT SIDE — Accept / Reject / Share ─────────────────────────── */

// Client gets all pending link requests sent to their email
exports.getLinkRequests = async (req, res, next) => {
  try {
    const requests = await ClientLink.find({
      clientEmail: req.user.email,
      status:      'pending',
    }).populate('lawyerId', 'name email');

    return sendSuccess(res, { requests, total: requests.length }, 'Link requests fetched');
  } catch (err) {
    next(err);
  }
};

// Client accepts a pending link request
exports.acceptLinkRequest = async (req, res, next) => {
  try {
    const link = await ClientLink.findById(req.params.linkId);

    if (!link) return sendError(res, 'Link request not found', 404);
    if (link.clientEmail !== req.user.email.trim().toLowerCase()) {
      return sendError(res, 'This link request was not sent to your email', 403);
    }
    if (link.status === 'accepted') return sendError(res, 'Link request already accepted', 400);
    if (link.status !== 'pending')  return sendError(res, `Link request is already ${link.status}`, 400);

    link.status    = 'accepted';
    link.clientId  = req.user._id;
    link.acceptedAt = new Date();
    await link.save();
    await link.populate('lawyerId', 'name email');

    await Alert.create({
      userId:    link.lawyerId._id,
      alertType: 'info',
      title:     `${req.user.name} accepted your link request`,
      message:   `${req.user.name} has accepted your link request. You can now view documents they choose to share with you.`,
      severity:  'info',
    });

    return sendSuccess(res, { link }, 'Link request accepted');
  } catch (err) {
    next(err);
  }
};

// Client rejects a pending link request
exports.rejectLinkRequest = async (req, res, next) => {
  try {
    const link = await ClientLink.findOneAndUpdate(
      { _id: req.params.linkId, clientEmail: req.user.email, status: 'pending' },
      { status: 'rejected', rejectedAt: new Date() },
      { new: true }
    );

    if (!link) return sendError(res, 'Link request not found', 404);

    return sendSuccess(res, {}, 'Link request rejected');
  } catch (err) {
    next(err);
  }
};

// Client shares a document with their lawyer
exports.shareDocument = async (req, res, next) => {
  try {
    const { linkId, documentId } = req.body;

    if (!linkId || !documentId) return sendError(res, 'linkId and documentId are required', 400);

    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    if (!document) return sendError(res, 'Document not found', 404);

    const link = await ClientLink.findOneAndUpdate(
      { _id: linkId, clientId: req.user._id, status: 'accepted' },
      { $addToSet: { sharedDocuments: documentId } },
      { new: true }
    );

    if (!link) return sendError(res, 'Link not found or not accepted', 404);

    await Alert.create({
      userId:    link.lawyerId,
      alertType: 'info',
      title:     `${req.user.name} shared a document with you`,
      message:   `Document "${document.originalName}" has been shared with you by ${req.user.name}.`,
      severity:  'info',
    });

    return sendSuccess(res, { link }, 'Document shared with lawyer');
  } catch (err) {
    next(err);
  }
};

// Client removes document sharing
exports.unshareDocument = async (req, res, next) => {
  try {
    const { linkId, documentId } = req.body;

    const link = await ClientLink.findOneAndUpdate(
      { _id: linkId, clientId: req.user._id, status: 'accepted' },
      { $pull: { sharedDocuments: documentId } },
      { new: true }
    );

    if (!link) return sendError(res, 'Link not found', 404);

    return sendSuccess(res, {}, 'Document sharing removed');
  } catch (err) {
    next(err);
  }
};

/* ── CASES CRUD ────────────────────────────────────────────────────── */

exports.getCases = async (req, res, next) => {
  try {
    const filter = { lawyerId: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const cases = await Case.find(filter)
      .populate('clientId', 'name email')
      .populate('documents', 'originalName docType healthScore')
      .sort({ updatedAt: -1 })
      .lean();

    const stats = {
      total:     cases.length,
      active:    cases.filter(c => c.status === 'active').length,
      pending:   cases.filter(c => c.status === 'pending').length,
      inReview:  cases.filter(c => c.status === 'in_review').length,
      completed: cases.filter(c => c.status === 'completed').length,
      closed:    cases.filter(c => c.status === 'closed').length,
    };

    return sendSuccess(res, { cases, stats }, 'Cases fetched');
  } catch (err) {
    next(err);
  }
};

exports.getCase = async (req, res, next) => {
  try {
    const found = await Case.findOne({ _id: req.params.id, lawyerId: req.user._id })
      .populate('clientId', 'name email')
      .populate('documents', 'originalName docType healthScore');

    if (!found) return sendError(res, 'Case not found', 404);
    return sendSuccess(res, { case: found }, 'Case fetched');
  } catch (err) {
    next(err);
  }
};

exports.createCase = async (req, res, next) => {
  try {
    const { title, clientId, clientLinkId, clientName, clientEmail,
            caseType, description, notes, status, priority, documentIds } = req.body;

    if (!title) return sendError(res, 'Case title is required', 400);

    // If creating a linked case, verify the lawyer-client link exists
    if (clientId) {
      const link = await ClientLink.findOne({
        lawyerId: req.user._id,
        clientId,
        status:   'accepted',
      });
      if (!link) return sendError(res, 'You are not linked to this client', 403);
    }

    // Standalone case requires at least clientName or clientEmail
    if (!clientId && !clientName && !clientEmail) {
      return sendError(res, 'Provide clientId (linked) or clientName/clientEmail (standalone)', 400);
    }

    const newCase = await Case.create({
      lawyerId:     req.user._id,
      clientId:     clientId     || null,
      clientLinkId: clientLinkId || null,
      clientName:   clientName   || null,
      clientEmail:  clientEmail  || null,
      title, caseType, description, notes,
      status:    status    || 'active',
      priority:  priority  || 'medium',
      documents: documentIds || [],
    });

    // Notify linked client if this is a linked case
    if (clientId) {
      await Alert.create({
        userId:    clientId,
        alertType: 'info',
        title:     `New case created: ${title}`,
        message:   `Your lawyer ${req.user.name} has created a new case titled "${title}" for you.`,
        severity:  'info',
      });
    }

    return sendSuccess(res, { case: newCase }, 'Case created', 201);
  } catch (err) {
    next(err);
  }
};

exports.updateCase = async (req, res, next) => {
  try {
    const { title, clientName, clientEmail, caseType,
            description, notes, status, priority, documentIds } = req.body;

    const update = { title, clientName, clientEmail, caseType, description, notes, priority };
    if (documentIds !== undefined) update.documents = documentIds;
    if (status) {
      update.status = status;
      if (status === 'closed')     update.closedAt    = new Date();
      if (status === 'completed')  update.completedAt = new Date();
    }

    // Remove undefined keys so Mongoose doesn't unset existing fields
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const found = await Case.findOneAndUpdate(
      { _id: req.params.id, lawyerId: req.user._id },
      update,
      { new: true, runValidators: true }
    ).populate('clientId', 'name email');

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

/* ── Client: see all their own links (any status except unlinked) ──── */

exports.getMyLinks = async (req, res, next) => {
  try {
    const links = await ClientLink.find({
      clientEmail: req.user.email,
      status: { $ne: 'unlinked' },
    })
      .populate('lawyerId', 'name email')
      .sort({ createdAt: -1 });

    return sendSuccess(res, { links, total: links.length }, 'Your links fetched');
  } catch (err) {
    next(err);
  }
};

// Client removes themselves from an accepted link
exports.clientUnlink = async (req, res, next) => {
  try {
    const link = await ClientLink.findOneAndUpdate(
      { _id: req.params.linkId, clientId: req.user._id, status: 'accepted' },
      { status: 'unlinked' },
      { new: true }
    );

    if (!link) return sendError(res, 'Link not found or not accepted', 404);

    return sendSuccess(res, {}, 'Unlinked successfully');
  } catch (err) {
    next(err);
  }
};

/* ── Clients list (union of linked accounts + standalone case emails) ─ */

exports.getClients = async (req, res, next) => {
  try {
    const [links, cases] = await Promise.all([
      ClientLink.find({ lawyerId: req.user._id })
        .populate('clientId', 'name email plan createdAt'),
      Case.find({ lawyerId: req.user._id }).lean(),
    ]);

    // Start with registered linked clients
    const clientMap = new Map();

    for (const link of links) {
      const email = link.clientEmail;
      clientMap.set(email, {
        name:           link.clientId?.name  || email,
        email,
        registeredUser: !!link.clientId,
        linkedAccount:  link.clientId        || null,
        linkId:         link._id,
        linkStatus:     link.status,
        sharedDocs:     link.sharedDocuments.length,
        totalCases:     0,
        activeCases:    0,
        cases:          [],
      });
    }

    // Merge standalone case clients
    for (const c of cases) {
      const email = c.clientEmail || c.clientId?.toString();
      if (!email) continue;
      if (!clientMap.has(email)) {
        clientMap.set(email, {
          name:           c.clientName || email,
          email,
          registeredUser: false,
          linkedAccount:  null,
          linkId:         null,
          linkStatus:     'none',
          sharedDocs:     0,
          totalCases:     0,
          activeCases:    0,
          cases:          [],
        });
      }
      const entry = clientMap.get(email);
      entry.totalCases++;
      if (['active', 'in_review', 'pending'].includes(c.status)) entry.activeCases++;
      entry.cases.push({ id: c._id, title: c.title, status: c.status, priority: c.priority });
    }

    const clients = Array.from(clientMap.values());
    return sendSuccess(res, { clients, total: clients.length }, 'Clients fetched');
  } catch (err) {
    next(err);
  }
};

/* ── Single link + client info (for LawyerClientView page) ─────────── */

exports.getClientLink = async (req, res, next) => {
  try {
    const link = await ClientLink.findOne({
      _id: req.params.linkId,
      lawyerId: req.user._id,
    }).populate('clientId', 'name email plan createdAt lastLogin');

    if (!link) return sendError(res, 'Client link not found', 404);

    const obj = link.toObject();
    if (link.clientId && link.status === 'accepted') {
      const [docCount, caseCount] = await Promise.all([
        Document.countDocuments({ userId: link.clientId._id }),
        Case.countDocuments({ lawyerId: req.user._id, clientId: link.clientId._id }),
      ]);
      obj.stats = {
        totalDocuments:  docCount,
        sharedDocuments: link.sharedDocuments.length,
        totalCases:      caseCount,
      };
    }

    return sendSuccess(res, { link: obj }, 'Link fetched');
  } catch (err) {
    next(err);
  }
};

/* ── Shared docs for a link (by linkId, not clientId) ──────────────── */

exports.getLinkDocuments = async (req, res, next) => {
  try {
    const link = await ClientLink.findOne({
      _id: req.params.linkId,
      lawyerId: req.user._id,
      status: 'accepted',
    });

    if (!link) return sendError(res, 'Client link not found or not accepted', 403);

    const documents = await Document.find({ _id: { $in: link.sharedDocuments } })
      .select('-extractedText')
      .lean();

    return sendSuccess(res, { documents, total: documents.length }, 'Documents fetched');
  } catch (err) {
    next(err);
  }
};

/* ── Full analysis for one shared document ──────────────────────────── */

exports.getClientDocAnalysis = async (req, res, next) => {
  try {
    const { linkId, docId } = req.params;

    const link = await ClientLink.findOne({
      _id: linkId,
      lawyerId: req.user._id,
      status: 'accepted',
    });

    if (!link) return sendError(res, 'Client link not found', 403);

    const isShared = link.sharedDocuments.some(id => id.toString() === docId);
    if (!isShared) return sendError(res, 'Document not shared with you', 403);

    const [document, analysis] = await Promise.all([
      Document.findById(docId).select('-extractedText').lean(),
      Analysis.findOne({ documentId: docId }).lean(),
    ]);

    if (!document) return sendError(res, 'Document not found', 404);

    return sendSuccess(res, { document, analysis: analysis || null }, 'Document analysis fetched');
  } catch (err) {
    next(err);
  }
};
