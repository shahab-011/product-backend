const ClientPortalAccess = require('../models/ClientPortalAccess.model');
const { sendError } = require('../utils/response');

// Authenticates client portal requests using the accessToken from Authorization header
module.exports = async function portalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return sendError(res, 'Portal authentication required', 401);

  const access = await ClientPortalAccess.findOne({ accessToken: token, isActive: true })
    .populate('matterId')
    .lean();

  if (!access) return sendError(res, 'Invalid or revoked portal session', 401);

  // Update lastAccessAt
  await ClientPortalAccess.findByIdAndUpdate(access._id, { lastAccessAt: new Date() });

  req.portalAccess = access;
  next();
};
