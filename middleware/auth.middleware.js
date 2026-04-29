const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const { sendError } = require('../utils/response');

/**
 * protect — validates the Bearer JWT, confirms the user still exists in the DB,
 * and attaches req.user for downstream controllers.
 *
 * Any failure (missing header, bad signature, expired token, deleted user) → 401.
 */
exports.protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Not authorized — no token provided', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Always re-fetch from DB so role/existence changes take effect immediately
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return sendError(res, 'Not authorized — user no longer exists', 401);
    }

    req.user = user;
    next();
  } catch {
    return sendError(res, 'Not authorized — token invalid or expired', 401);
  }
};

/**
 * authorize(...roles) — must run after protect.
 * Returns 403 if req.user.role is not in the allowed list.
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied — role '${req.user.role}' cannot access this resource`,
        403
      );
    }
    next();
  };
};
