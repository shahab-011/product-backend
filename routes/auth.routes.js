const express = require('express');
const router  = express.Router();
const {
  register,
  login,
  getMe,
  updatePassword,
  updateProfile,
  getUserStats,
  deleteAccount,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/register',         register);
router.post('/login',            login);
router.get('/me',                protect, getMe);
router.get('/stats',             protect, getUserStats);
router.put('/update-password',   protect, updatePassword);
router.put('/update-profile',    protect, updateProfile);
router.delete('/delete-account', protect, deleteAccount);

module.exports = router;
