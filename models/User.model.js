const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'lawyer', 'admin'], default: 'user', required: true },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    avatarUrl: { type: String },
    isVerified: { type: Boolean, default: false },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ createdAt: 1 });

UserSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

UserSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.passwordHash);
};

UserSchema.methods.generateJWT = function () {
  return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

module.exports = mongoose.model('User', UserSchema);
