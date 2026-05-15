const jwt  = require('jsonwebtoken');
const User = require('../models/User.model');
const CustomRole = require('../models/CustomRole.model');
const { sendError } = require('../utils/response');

/* ─── protect ─────────────────────────────────────────────────── */
exports.protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return sendError(res, 'Not authorized — no token provided', 401);

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) return sendError(res, 'Not authorized — user no longer exists', 401);
    if (!user.isActive) return sendError(res, 'Account is inactive', 403);
    req.user = user;
    next();
  } catch {
    return sendError(res, 'Not authorized — token invalid or expired', 401);
  }
};

/* ─── authorize(...roles) ─────────────────────────────────────── */
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return sendError(res, `Access denied — role '${req.user.role}' cannot access this resource`, 403);
  next();
};

/* ─── checkPermission(flag) ──────────────────────────────────── */
exports.checkPermission = (flag) => async (req, res, next) => {
  const user = req.user;

  // owner and admin bypass all permission checks
  if (['owner', 'admin'].includes(user.role)) return next();

  // Check built-in role defaults
  const ROLE_DEFAULTS = {
    lawyer:    ['matters:read','matters:create','matters:update','contacts:read','contacts:create','contacts:update','tasks:read','tasks:create','tasks:update','time:read','time:create','billing:invoice:read','leads:read','leads:create','leads:update','esign:read','esign:send','reports:read'],
    attorney:  ['matters:read','matters:create','matters:update','contacts:read','contacts:create','contacts:update','tasks:read','tasks:create','time:read','time:create','billing:invoice:read','leads:read','reports:read'],
    paralegal: ['matters:read','contacts:read','tasks:read','tasks:create','tasks:update','time:read','time:create'],
    staff:     ['matters:read','contacts:read','tasks:read'],
    client:    ['matters:read'],
    user:      [],
  };

  const defaults = ROLE_DEFAULTS[user.role] || [];

  // Check user-level permission override
  if (user.permissions && user.permissions[flag] !== undefined)
    return user.permissions[flag] ? next() : sendError(res, 'Permission denied', 403);

  // Check custom role permissions
  if (user.customRoleId) {
    const customRole = await CustomRole.findById(user.customRoleId);
    if (customRole && customRole.permissions[flag] !== undefined)
      return customRole.permissions[flag] ? next() : sendError(res, 'Permission denied', 403);
  }

  // Fall back to role defaults
  if (defaults.includes(flag)) return next();

  return sendError(res, 'Permission denied', 403);
};
