const User = require('../models/User.model');
const { sendSuccess, sendError } = require('../utils/response');

const MIN_PASSWORD_LENGTH = 6;

// Clients may self-select 'user' or 'lawyer' — 'admin' is never accepted from the wire
const ALLOWED_REGISTER_ROLES = new Set(['user', 'lawyer']);

const userPayload = (user) => ({
  id:    user._id,
  name:  user.name,
  email: user.email,
  role:  user.role,
  plan:  user.plan,
});

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 'Please provide name, email, and password', 400);
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return sendError(res, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return sendError(res, 'An account with this email already exists', 400);
    }

    const safeRole = ALLOWED_REGISTER_ROLES.has(role) ? role : 'user';
    const user = await User.create({ name, email, passwordHash: password, role: safeRole });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = user.generateJWT();

    return sendSuccess(res, { token, user: userPayload(user) }, 'Registration successful', 201);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 'Please provide email and password', 400);
    }

    const user = await User.findOne({ email }).select('+passwordHash');

    // Combined check — same message for wrong email OR wrong password
    // prevents user-enumeration: attacker cannot tell which one failed
    if (!user || !(await user.matchPassword(password))) {
      return sendError(res, 'Invalid email or password', 401);
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = user.generateJWT();

    return sendSuccess(res, { token, user: userPayload(user) }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    return sendSuccess(res, { user: userPayload(req.user) }, 'User fetched');
  } catch (err) {
    next(err);
  }
};

exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 'Please provide currentPassword and newPassword', 400);
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return sendError(res, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    if (!(await user.matchPassword(currentPassword))) {
      return sendError(res, 'Current password is incorrect', 401);
    }

    user.passwordHash = newPassword;
    await user.save();

    return sendSuccess(res, null, 'Password updated successfully');
  } catch (err) {
    next(err);
  }
};
