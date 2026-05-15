const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode   = require('qrcode');

const User          = require('../models/User.model');
const FirmSettings  = require('../models/FirmSettings.model');
const Document      = require('../models/Document.model');
const Analysis      = require('../models/Analysis.model');
const { sendSuccess, sendError } = require('../utils/response');
const {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendAccountLockedEmail,
} = require('../utils/email');

/* ─── helpers ────────────────────────────────────────────────── */
const MIN_PASSWORD_LENGTH = 8;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isStrongPassword(pw) {
  return pw.length >= MIN_PASSWORD_LENGTH &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw);
}

function setRefreshCookie(res, token, rememberMe = false) {
  const maxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000   // 30 days
    : 7  * 24 * 60 * 60 * 1000;  // 7 days
  res.cookie('nyaya_refresh', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  });
}

const userPayload = (user) => ({
  id:               user._id,
  name:             user.name,
  email:            user.email,
  role:             user.role,
  plan:             user.plan,
  firmId:           user.firmId || user._id,
  phone:            user.phone,
  barNumber:        user.barNumber,
  avatarUrl:        user.avatarUrl || null,
  isEmailVerified:  user.isEmailVerified,
  twoFactorEnabled: user.twoFactorEnabled,
  createdAt:        user.createdAt,
  lastLoginAt:      user.lastLoginAt,
});

/* ─── REGISTER ───────────────────────────────────────────────── */
exports.register = async (req, res) => {
  const { name, email, password, role, firmName, phone, barNumber, firmSize, country } = req.body;

  if (!name || !email || !password)
    return sendError(res, 'Name, email and password are required', 400);

  if (!isStrongPassword(password))
    return sendError(res, 'Password must be 8+ characters with at least one uppercase letter, one number, and one special character', 400);

  if (await User.findOne({ email }))
    return sendError(res, 'An account with this email already exists', 400);

  // New registrations default to 'owner' role
  const safeRole = ['owner', 'lawyer', 'admin', 'user'].includes(role) ? role : 'owner';

  const otp = generateOTP();
  const user = await User.create({
    name,
    email,
    passwordHash: password,
    role: safeRole,
    phone,
    barNumber,
    isEmailVerified: false,
    emailVerificationOTP: otp,
    emailVerificationExpires: new Date(Date.now() + 10 * 60 * 1000),
  });

  // firmId = own _id (owner of their firm)
  user.firmId = user._id;
  await user.save({ validateBeforeSave: false });

  // Auto-create FirmSettings
  await FirmSettings.create({
    firmId:  user._id,
    name:    firmName || `${name}'s Firm`,
    firmSize: firmSize || 'solo',
    country:  country || 'Pakistan',
    onboardingComplete: false,
  });

  // Send OTP
  await sendOTPEmail(email, name, otp).catch(() => {});

  return sendSuccess(res, { pendingEmail: email }, 'Account created — check your email for the verification code', 201);
};

/* ─── VERIFY EMAIL ───────────────────────────────────────────── */
exports.verifyEmail = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return sendError(res, 'Email and OTP are required', 400);

  const user = await User.findOne({ email })
    .select('+emailVerificationOTP +emailVerificationExpires');

  if (!user) return sendError(res, 'No account found with this email', 404);
  if (user.isEmailVerified) return sendError(res, 'Email already verified', 400);
  if (!user.emailVerificationOTP || user.emailVerificationExpires < new Date())
    return sendError(res, 'Verification code has expired — request a new one', 400);
  if (user.emailVerificationOTP !== otp.trim())
    return sendError(res, 'Invalid verification code', 400);

  user.isEmailVerified = true;
  user.isVerified = true;
  user.emailVerificationOTP = undefined;
  user.emailVerificationExpires = undefined;
  user.lastLoginAt = new Date();
  user.lastLogin   = new Date();

  const refreshToken = user.generateRefreshToken(req.headers['user-agent'] || 'web');
  await user.save({ validateBeforeSave: false });

  const token = user.generateJWT();
  setRefreshCookie(res, refreshToken);

  return sendSuccess(res, { token, user: userPayload(user) }, 'Email verified — welcome!');
};

/* ─── RESEND OTP ─────────────────────────────────────────────── */
exports.resendOTP = async (req, res) => {
  const { email } = req.body;
  if (!email) return sendError(res, 'Email is required', 400);

  const user = await User.findOne({ email })
    .select('+emailVerificationOTP +emailVerificationExpires');

  if (!user) return sendError(res, 'No account found', 404);
  if (user.isEmailVerified) return sendError(res, 'Email already verified', 400);

  const otp = generateOTP();
  user.emailVerificationOTP = otp;
  user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  await sendOTPEmail(email, user.name, otp).catch(() => {});
  return sendSuccess(res, null, 'Verification code sent');
};

/* ─── LOGIN ──────────────────────────────────────────────────── */
exports.login = async (req, res) => {
  const { email, password, rememberMe, totpCode } = req.body;

  if (!email || !password) return sendError(res, 'Email and password are required', 400);

  const user = await User.findOne({ email })
    .select('+passwordHash +failedLoginAttempts +lockUntil +twoFactorSecret +twoFactorEnabled +backupCodes');

  // Same message for wrong email or password — prevents enumeration
  if (!user) return sendError(res, 'Invalid email or password', 401);

  // Account locked?
  if (user.isAccountLocked()) {
    const remaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return sendError(res, `Account locked. Try again in ${remaining} minute(s)`, 423);
  }

  if (!user.isActive) return sendError(res, 'Account is inactive. Contact your administrator.', 403);

  const passwordOk = await user.matchPassword(password);
  if (!passwordOk) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      await user.save({ validateBeforeSave: false });
      await sendAccountLockedEmail(email, user.name).catch(() => {});
      return sendError(res, 'Too many failed attempts — account locked for 15 minutes', 423);
    }
    await user.save({ validateBeforeSave: false });
    return sendError(res, 'Invalid email or password', 401);
  }

  // 2FA check
  if (user.twoFactorEnabled) {
    if (!totpCode) return sendSuccess(res, { requires2FA: true }, '2FA code required', 200);

    let valid = authenticator.verify({ token: totpCode, secret: user.twoFactorSecret });
    if (!valid) {
      // Check backup codes
      const backupIdx = (user.backupCodes || []).indexOf(totpCode);
      if (backupIdx === -1) return sendError(res, 'Invalid 2FA code', 401);
      user.backupCodes.splice(backupIdx, 1); // consume backup code
      valid = true;
    }
    if (!valid) return sendError(res, 'Invalid 2FA code', 401);
  }

  // Success — reset lock state
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  user.lastLogin   = new Date();

  const refreshToken = rememberMe
    ? user.generateRefreshTokenLong(req.headers['user-agent'] || 'web')
    : user.generateRefreshToken(req.headers['user-agent'] || 'web');
  await user.save({ validateBeforeSave: false });

  const token = user.generateJWT();
  setRefreshCookie(res, refreshToken, rememberMe);

  // Check onboarding
  const settings = await FirmSettings.findOne({ firmId: user.firmId || user._id });
  const needsOnboarding = settings && !settings.onboardingComplete;

  return sendSuccess(res, {
    token,
    user: userPayload(user),
    needsOnboarding: !!needsOnboarding,
  }, 'Login successful');
};

/* ─── REFRESH TOKEN ──────────────────────────────────────────── */
exports.refreshToken = async (req, res) => {
  const token = req.cookies?.nyaya_refresh || req.body?.refreshToken;
  if (!token) return sendError(res, 'Refresh token missing', 401);

  const user = await User.findOne({ 'refreshTokens.token': token });
  if (!user) return sendError(res, 'Invalid refresh token', 401);

  const stored = user.refreshTokens.find(t => t.token === token);
  if (!stored || stored.expiresAt < new Date()) {
    return sendError(res, 'Refresh token expired', 401);
  }

  const newAccessToken = user.generateJWT();
  return sendSuccess(res, { token: newAccessToken }, 'Token refreshed');
};

/* ─── LOGOUT ─────────────────────────────────────────────────── */
exports.logout = async (req, res) => {
  const token = req.cookies?.nyaya_refresh || req.body?.refreshToken;
  if (token && req.user) {
    req.user.refreshTokens = (req.user.refreshTokens || []).filter(t => t.token !== token);
    await req.user.save({ validateBeforeSave: false });
  }
  res.clearCookie('nyaya_refresh');
  return sendSuccess(res, null, 'Logged out');
};

/* ─── FORGOT PASSWORD ────────────────────────────────────────── */
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return sendError(res, 'Email is required', 400);

  // Always respond with same message — prevents enumeration
  const user = await User.findOne({ email });
  if (!user) return sendSuccess(res, null, 'If that email exists, a reset link has been sent');

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken   = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
  await sendPasswordResetEmail(email, user.name, resetUrl).catch(() => {});

  return sendSuccess(res, null, 'If that email exists, a reset link has been sent');
};

/* ─── RESET PASSWORD ─────────────────────────────────────────── */
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return sendError(res, 'Token and new password are required', 400);

  if (!isStrongPassword(password))
    return sendError(res, 'Password must be 8+ characters with uppercase, number, and special character', 400);

  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetToken:   hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordHash +passwordHistory +passwordResetToken +passwordResetExpires');

  if (!user) return sendError(res, 'Reset link is invalid or has expired', 400);

  if (await user.isPasswordInHistory(password))
    return sendError(res, 'This password was used recently. Please choose a different one.', 400);

  user.passwordHash = password;
  user.passwordResetToken   = undefined;
  user.passwordResetExpires = undefined;
  // Invalidate all refresh tokens on password reset
  user.refreshTokens = [];
  await user.save();

  return sendSuccess(res, null, 'Password reset successful — please log in');
};

/* ─── CHANGE PASSWORD (authenticated) ───────────────────────── */
exports.updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return sendError(res, 'currentPassword and newPassword are required', 400);

  if (!isStrongPassword(newPassword))
    return sendError(res, 'Password must be 8+ characters with uppercase, number, and special character', 400);

  const user = await User.findById(req.user._id)
    .select('+passwordHash +passwordHistory');
  if (!user) return sendError(res, 'User not found', 404);

  if (!(await user.matchPassword(currentPassword)))
    return sendError(res, 'Current password is incorrect', 401);

  if (await user.isPasswordInHistory(newPassword))
    return sendError(res, 'This password was used recently. Please choose a different one.', 400);

  user.passwordHash = newPassword;
  await user.save();

  return sendSuccess(res, null, 'Password updated successfully');
};

/* ─── 2FA SETUP ──────────────────────────────────────────────── */
exports.setup2FA = async (req, res) => {
  const user = await User.findById(req.user._id).select('+twoFactorSecret');

  const secret = authenticator.generateSecret();
  const otpAuthUrl = authenticator.keyuri(user.email, 'Nyaya Law', secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

  // Store secret temporarily (not enabled until verified)
  user.twoFactorSecret = secret;
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, { qrCode: qrCodeDataUrl, secret }, '2FA setup initiated — scan the QR code then verify');
};

/* ─── 2FA VERIFY (enable) ────────────────────────────────────── */
exports.verify2FA = async (req, res) => {
  const { totpCode } = req.body;
  if (!totpCode) return sendError(res, 'TOTP code is required', 400);

  const user = await User.findById(req.user._id).select('+twoFactorSecret');
  if (!user.twoFactorSecret) return sendError(res, 'Run 2FA setup first', 400);

  const valid = authenticator.verify({ token: totpCode, secret: user.twoFactorSecret });
  if (!valid) return sendError(res, 'Invalid code — check your authenticator app', 400);

  // Generate 10 single-use backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  user.twoFactorEnabled = true;
  user.backupCodes = backupCodes;
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, { backupCodes }, '2FA enabled — save your backup codes');
};

/* ─── 2FA DISABLE ────────────────────────────────────────────── */
exports.disable2FA = async (req, res) => {
  const { password } = req.body;
  if (!password) return sendError(res, 'Confirm your password to disable 2FA', 400);

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.matchPassword(password)))
    return sendError(res, 'Incorrect password', 401);

  user.twoFactorEnabled = false;
  user.twoFactorSecret  = undefined;
  user.backupCodes      = [];
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, null, '2FA disabled');
};

/* ─── GET ME ─────────────────────────────────────────────────── */
exports.getMe = async (req, res) => {
  return sendSuccess(res, { user: userPayload(req.user) }, 'User fetched');
};

/* ─── UPDATE PROFILE ─────────────────────────────────────────── */
const VALID_AVATAR_IDS = new Set(['av0','av1','av2','av3','av4','av5']);
const MAX_AVATAR_BYTES = 400_000;

function isValidAvatarValue(val) {
  if (VALID_AVATAR_IDS.has(val)) return true;
  if (typeof val === 'string' && val.startsWith('data:image/') && val.length <= MAX_AVATAR_BYTES) return true;
  return false;
}

exports.updateProfile = async (req, res) => {
  const { name, avatarUrl, phone, barNumber } = req.body;
  const updates = {};

  if (name !== undefined) {
    if (!name || !name.trim()) return sendError(res, 'Name is required', 400);
    if (name.trim().length > 100) return sendError(res, 'Name too long', 400);
    updates.name = name.trim();
  }
  if (avatarUrl !== undefined) {
    if (!isValidAvatarValue(avatarUrl)) return sendError(res, 'Invalid avatar or image too large', 400);
    updates.avatarUrl = avatarUrl;
  }
  if (phone !== undefined) updates.phone = phone;
  if (barNumber !== undefined) updates.barNumber = barNumber;

  if (!Object.keys(updates).length) return sendError(res, 'Nothing to update', 400);

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  return sendSuccess(res, { user: userPayload(user) }, 'Profile updated');
};

/* ─── COMPLETE ONBOARDING ────────────────────────────────────── */
exports.completeOnboarding = async (req, res) => {
  const firmId = req.user.firmId || req.user._id;
  const { firmProfile, billing, plan } = req.body;

  const updates = { onboardingComplete: true };
  if (plan) updates.plan = plan;
  if (firmProfile) Object.assign(updates, firmProfile);
  if (billing) {
    if (billing.currency) updates.currency = billing.currency;
    if (billing.defaultHourlyRate !== undefined) updates.defaultHourlyRate = billing.defaultHourlyRate;
    if (billing.invoicePrefix) updates.invoicePrefix = billing.invoicePrefix;
    if (billing.paymentTermsDays !== undefined) updates.paymentTermsDays = billing.paymentTermsDays;
  }

  const settings = await FirmSettings.findOneAndUpdate(
    { firmId },
    { $set: updates },
    { new: true, upsert: true }
  );

  return sendSuccess(res, { settings }, 'Onboarding complete');
};

/* ─── USER STATS ─────────────────────────────────────────────── */
exports.getUserStats = async (req, res) => {
  const uid = req.user._id;
  const [docStats, analysisCount] = await Promise.all([
    Document.aggregate([
      { $match: { userId: uid } },
      { $group: { _id: null, total: { $sum: 1 }, risks: { $sum: '$riskCount' } } },
    ]),
    Analysis.countDocuments({ userId: uid }),
  ]);
  return sendSuccess(res, {
    totalDocuments: docStats[0]?.total  ?? 0,
    totalRisks:     docStats[0]?.risks  ?? 0,
    totalAnalyses:  analysisCount,
    memberSince:    req.user.createdAt,
    lastLogin:      req.user.lastLoginAt,
  }, 'Stats fetched');
};

/* ─── DELETE ACCOUNT ─────────────────────────────────────────── */
exports.deleteAccount = async (req, res) => {
  const uid = req.user._id;
  await Promise.all([
    Document.deleteMany({ userId: uid }),
    Analysis.deleteMany({ userId: uid }),
  ]);
  await User.findByIdAndDelete(uid);
  return sendSuccess(res, null, 'Account deleted');
};
