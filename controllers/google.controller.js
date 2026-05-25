const crypto      = require('crypto');
const User        = require('../models/User.model');
const FirmSettings = require('../models/FirmSettings.model');

const GOOGLE_AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function getRedirectUri() {
  const base = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
  return `${base}/api/auth/google/callback`;
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

/* ── Step 1: redirect browser to Google consent screen ────────── */
exports.googleLogin = (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ success: false, message: 'Google OAuth is not configured' });
  }

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  getRedirectUri(),
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
};

/* ── Step 2: Google redirects here with ?code= ─────────────────── */
exports.googleCallback = async (req, res) => {
  const FRONTEND = getFrontendUrl();
  const { code, error: oauthError } = req.query;

  if (oauthError || !code) {
    return res.redirect(`${FRONTEND}/login?error=google_cancelled`);
  }

  try {
    /* Exchange code → access_token */
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  getRedirectUri(),
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      return res.redirect(`${FRONTEND}/login?error=google_token_failed`);
    }

    /* Fetch Google profile */
    const profileRes  = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    // { id, email, name, picture, verified_email }

    if (!profile.email || !profile.verified_email) {
      return res.redirect(`${FRONTEND}/login?error=google_unverified_email`);
    }

    const email = profile.email.toLowerCase();

    /* Find or create user */
    let user     = await User.findOne({ email });
    let isNewUser = false;

    if (user) {
      /* Existing account — link Google if not already linked */
      let dirty = false;
      if (!user.googleId)  { user.googleId = profile.id;       dirty = true; }
      if (!user.avatarUrl && profile.picture) { user.avatarUrl = profile.picture; dirty = true; }
      if (user.authProvider !== 'google' && !user.googleId) {
        user.authProvider = 'google'; dirty = true;
      }
      if (dirty) await user.save({ validateBeforeSave: false });
    } else {
      /* New account — create with random password (Google users won't use it) */
      isNewUser = true;
      user = await User.create({
        name:            profile.name || email.split('@')[0],
        email,
        passwordHash:    crypto.randomBytes(32).toString('hex'), // pre-save hook will bcrypt this
        googleId:        profile.id,
        authProvider:    'google',
        avatarUrl:       profile.picture || null,
        isEmailVerified: true,
        isVerified:      true,
        role:            'owner',
      });

      /* firmId = own _id for the firm owner */
      user.firmId = user._id;
      await user.save({ validateBeforeSave: false });

      /* Create FirmSettings so onboarding wizard has a record to update */
      await FirmSettings.create({
        firmId:             user._id,
        name:               `${user.name}'s Firm`,
        firmSize:           'solo',
        country:            'India',
        onboardingComplete: false,
      }).catch(() => {});
    }

    /* Update last-login */
    user.lastLoginAt = new Date();
    user.lastLogin   = new Date();
    user.failedLoginAttempts = 0;
    const refreshToken = user.generateRefreshToken('google-oauth');
    await user.save({ validateBeforeSave: false });

    const jwtToken = user.generateJWT();

    /* Redirect to frontend callback page with credentials in query */
    const qs = new URLSearchParams({
      token:   jwtToken,
      refresh: refreshToken,
      new:     isNewUser ? '1' : '0',
    });
    res.redirect(`${FRONTEND}/auth/google/callback?${qs}`);

  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${getFrontendUrl()}/login?error=google_server_error`);
  }
};
