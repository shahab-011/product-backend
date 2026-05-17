const AuditLog = require('../models/AuditLog.model');

const SENSITIVE = new Set(['password', 'token', 'secret', 'plaidAccessToken', 'creditCard', 'ssn']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = SENSITIVE.has(k) ? '[REDACTED]' : (typeof v === 'object' ? '[object]' : v);
  }
  return out;
}

function auditLog(req, res, next) {
  if (!WRITE_METHODS.has(req.method) || !req.user) return next();

  // Capture response status after it's sent
  const orig = res.json.bind(res);
  res.json = function (body) {
    // Fire-and-forget — don't block the response
    setImmediate(async () => {
      try {
        await AuditLog.create({
          firmId:     req.user.firmId || req.user._id,
          userId:     req.user._id,
          method:     req.method,
          path:       req.originalUrl?.slice(0, 500),
          ip:         req.ip || req.socket?.remoteAddress,
          userAgent:  req.get('user-agent')?.slice(0, 300),
          statusCode: res.statusCode,
          reqBody:    sanitizeBody(req.body),
        });
      } catch {}
    });
    return orig(body);
  };

  next();
}

module.exports = auditLog;
