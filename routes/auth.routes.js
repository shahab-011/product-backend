const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const {
  register,
  verifyEmail,
  resendOTP,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  updatePassword,
  setup2FA,
  verify2FA,
  disable2FA,
  getMe,
  updateProfile,
  completeOnboarding,
  getUserStats,
  deleteAccount,
} = require('../controllers/auth.controller');

const { protect } = require('../middleware/auth.middleware');

/* ─── Rate limiters ───────────────────────────────────────────── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many login attempts — try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: { success: false, message: 'Too many password reset requests — try again in 1 hour' },
});

const resendOTPLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 3,
  message: { success: false, message: 'Too many OTP requests — wait 10 minutes' },
});

/* ─── Public routes ───────────────────────────────────────────── */
router.post('/register',          register);
router.post('/verify-email',      verifyEmail);
router.post('/resend-otp',        resendOTPLimiter, resendOTP);
router.post('/login',             loginLimiter, login);
router.post('/refresh',           refreshToken);
router.post('/forgot-password',   forgotPasswordLimiter, forgotPassword);
router.post('/reset-password',    resetPassword);

/* ─── Protected routes ────────────────────────────────────────── */
router.post('/logout',              protect, logout);
router.get('/me',                   protect, getMe);
router.put('/update-profile',       protect, updateProfile);
router.put('/update-password',      protect, updatePassword);
router.post('/2fa/setup',           protect, setup2FA);
router.post('/2fa/verify',          protect, verify2FA);
router.post('/2fa/disable',         protect, disable2FA);
router.post('/onboarding/complete', protect, completeOnboarding);
router.get('/stats',                protect, getUserStats);
router.delete('/delete-account',    protect, deleteAccount);

module.exports = router;
