const router = require('express').Router();
const ctrl   = require('../controllers/calendar.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const auth = [protect, authorize('lawyer', 'admin', 'owner', 'attorney', 'paralegal', 'staff')];

// Public booking (no auth)
router.get('/booking/:slug',       ctrl.getBookingPage);
router.post('/booking/:slug/book', ctrl.createBooking);

// Public court-rule lookups (no auth needed — reference data)
router.get('/court-rules/jurisdictions', ctrl.listJurisdictions);
router.get('/court-rules',               ctrl.searchRules);

// Calendar event routes
router.get('/calendar-events/event-types',         ctrl.getEventTypes);
router.post('/calendar-events/from-rules',          ...auth, ctrl.generateDeadlinesFromRule);
router.post('/calendar-events/confirm-deadlines',   ...auth, ctrl.confirmDeadlines);
router.get('/calendar-events',                      ...auth, ctrl.listEvents);
router.post('/calendar-events',                     ...auth, ctrl.createEvent);
router.get('/calendar-events/:id',                  ...auth, ctrl.getEvent);
router.put('/calendar-events/:id',                  ...auth, ctrl.updateEvent);
router.patch('/calendar-events/:id',                ...auth, ctrl.updateEvent);
router.delete('/calendar-events/:id',               ...auth, ctrl.deleteEvent);

// Availability
router.get('/availability', ...auth, ctrl.getAvailability);
router.put('/availability', ...auth, ctrl.updateAvailability);

module.exports = router;
