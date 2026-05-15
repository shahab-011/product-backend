const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const RefreshTokenSchema = new mongoose.Schema({
  token:     { type: String, required: true },
  device:    { type: String, default: 'unknown' },
  expiresAt: { type: Date, required: true },
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    // Identity
    name:  { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },

    // Firm association
    firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    // Role — expanded set; old roles kept for backward compat
    role: {
      type: String,
      enum: ['user', 'lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff', 'client'],
      default: 'owner',
      required: true,
    },
    customRoleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomRole' },

    // Profile
    phone:     { type: String },
    barNumber: { type: String },
    avatarUrl: { type: String },
    plan:      { type: String, enum: ['free', 'starter', 'advanced', 'expand', 'pro'], default: 'free' },

    // Email verification
    isVerified:      { type: Boolean, default: false },  // legacy field kept
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationOTP:     { type: String, select: false },
    emailVerificationExpires: { type: Date,   select: false },

    // Password reset
    passwordResetToken:   { type: String, select: false },
    passwordResetExpires: { type: Date,   select: false },

    // Password history — store last 5 hashed passwords to prevent reuse
    passwordHistory: { type: [String], select: false, default: [] },

    // Two-Factor Authentication
    twoFactorSecret:  { type: String,  select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    backupCodes:      { type: [String], select: false, default: [] },

    // Account security
    failedLoginAttempts: { type: Number,  default: 0 },
    lockUntil:           { type: Date },
    isActive:            { type: Boolean, default: true },
    lastLogin:           { type: Date },  // legacy alias
    lastLoginAt:         { type: Date },

    // Sessions
    refreshTokens: { type: [RefreshTokenSchema], default: [] },
  },
  { timestamps: true }
);

UserSchema.index({ firmId: 1 });
UserSchema.index({ createdAt: 1 });

/* ─── Pre-save: hash password + update history ─────────────────── */
UserSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  const hashed = await bcrypt.hash(this.passwordHash, 12);
  // Keep last 5 hashed passwords (already hashed copies)
  const history = (this.passwordHistory || []).slice(-4);
  history.push(hashed);
  this.passwordHistory = history;
  this.passwordHash = hashed;
});

/* ─── Instance methods ──────────────────────────────────────────── */
UserSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.passwordHash);
};

UserSchema.methods.isPasswordInHistory = async function (newPassword) {
  for (const old of this.passwordHistory || []) {
    if (await bcrypt.compare(newPassword, old)) return true;
  }
  return false;
};

UserSchema.methods.isAccountLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

UserSchema.methods.generateJWT = function () {
  return jwt.sign(
    { id: this._id, role: this.role, firmId: this.firmId || this._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
};

UserSchema.methods.generateRefreshToken = function (device = 'unknown') {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  // Prune old expired tokens first
  this.refreshTokens = (this.refreshTokens || []).filter(t => t.expiresAt > new Date());
  this.refreshTokens.push({ token, device, expiresAt });
  return token;
};

UserSchema.methods.generateRefreshTokenLong = function (device = 'unknown') {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  this.refreshTokens = (this.refreshTokens || []).filter(t => t.expiresAt > new Date());
  this.refreshTokens.push({ token, device, expiresAt });
  return token;
};

module.exports = mongoose.model('User', UserSchema);
