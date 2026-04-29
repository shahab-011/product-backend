const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const {
  getDashboard,
  getClients,
  getCases, getCase, createCase, updateCase, deleteCase,
} = require('../controllers/lawyer.controller');

// All lawyer routes require a valid JWT AND the 'lawyer' or 'admin' role
router.use(protect, authorize('lawyer', 'admin'));

router.get('/dashboard',   getDashboard);
router.get('/clients',     getClients);

router.route('/cases')
  .get(getCases)
  .post(createCase);

router.route('/cases/:id')
  .get(getCase)
  .put(updateCase)
  .delete(deleteCase);

module.exports = router;
