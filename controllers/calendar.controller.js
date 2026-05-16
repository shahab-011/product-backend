const CalendarEvent = require('../models/CalendarEvent.model');
const CourtRule     = require('../models/CourtRule.model');
const Availability  = require('../models/Availability.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

const EVENT_TYPES = [
  'court_date','hearing','deposition','client_meeting',
  'filing_deadline','conference_call','appointment','reminder','sol','other',
];

exports.getEventTypes = (req, res) => sendSuccess(res, EVENT_TYPES, 'Event types');

/* ── Events ──────────────────────────────────────────────────────── */

exports.listEvents = async (req, res) => {
  const firmId = getFirmId(req);
  const { from, to, matterId, eventType, limit = 500 } = req.query;

  const filter = {
    firmId,
    isDeleted: { $ne: true },
    $or: [{ isPrivate: { $ne: true } }, { createdBy: req.user._id }],
  };
  if (matterId)  filter.matterId  = matterId;
  if (eventType) filter.eventType = eventType;
  if (from || to) {
    filter.startDate = {};
    if (from) filter.startDate.$gte = new Date(from);
    if (to)   filter.startDate.$lte = new Date(to);
  }

  const events = await CalendarEvent.find(filter)
    .populate('matterId', 'title matterNumber')
    .populate('createdBy', 'name')
    .sort({ startDate: 1 })
    .limit(Number(limit))
    .lean();

  sendSuccess(res, events, 'Events fetched');
};

exports.getEvent = async (req, res) => {
  const firmId = getFirmId(req);
  const event = await CalendarEvent.findOne({ _id: req.params.id, firmId, isDeleted: { $ne: true } })
    .populate('matterId', 'title matterNumber')
    .populate('createdBy', 'name')
    .lean();
  if (!event) return sendError(res, 'Event not found', 404);
  sendSuccess(res, event, 'Event fetched');
};

exports.createEvent = async (req, res) => {
  const firmId = getFirmId(req);
  const event = await CalendarEvent.create({
    ...req.body,
    firmId,
    createdBy: req.user._id,
    isCourtDate: req.body.eventType === 'court_date',
    isSol:       req.body.eventType === 'sol',
  });
  sendSuccess(res, event, 'Event created', 201);
};

exports.updateEvent = async (req, res) => {
  const firmId = getFirmId(req);
  const event = await CalendarEvent.findOneAndUpdate(
    { _id: req.params.id, firmId, isDeleted: { $ne: true } },
    {
      ...req.body,
      isCourtDate: req.body.eventType === 'court_date',
      isSol:       req.body.eventType === 'sol',
    },
    { new: true, runValidators: true }
  );
  if (!event) return sendError(res, 'Event not found', 404);
  sendSuccess(res, event, 'Event updated');
};

exports.deleteEvent = async (req, res) => {
  const firmId = getFirmId(req);
  const event = await CalendarEvent.findOneAndUpdate(
    { _id: req.params.id, firmId },
    { isDeleted: true },
    { new: true }
  );
  if (!event) return sendError(res, 'Event not found', 404);
  sendSuccess(res, null, 'Event deleted');
};

/* ── Court Rules Calendaring ─────────────────────────────────────── */

exports.listJurisdictions = async (req, res) => {
  const states = await CourtRule.distinct('state', { isActive: true });
  sendSuccess(res, states.sort(), 'Jurisdictions');
};

exports.searchRules = async (req, res) => {
  const { state, courtName, caseType, triggerEvent } = req.query;
  const filter = { isActive: true };
  if (state)        filter.state        = new RegExp(state, 'i');
  if (courtName)    filter.courtName    = new RegExp(courtName, 'i');
  if (caseType)     filter.caseType     = new RegExp(caseType, 'i');
  if (triggerEvent) filter.triggerEvent = new RegExp(triggerEvent, 'i');
  const rules = await CourtRule.find(filter).limit(50).lean();
  sendSuccess(res, rules, 'Court rules');
};

function addWeekdays(date, days) {
  const d = new Date(date);
  let added = 0;
  const step = days >= 0 ? 1 : -1;
  while (added < Math.abs(days)) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

exports.generateDeadlinesFromRule = async (req, res) => {
  const firmId = getFirmId(req);
  const { ruleId, triggerDate, matterId } = req.body;

  const rule = await CourtRule.findById(ruleId);
  if (!rule) return sendError(res, 'Court rule not found', 404);

  const trigger = new Date(triggerDate);
  const preview = rule.deadlines.map(d => {
    const date = d.isWeekdayOnly
      ? addWeekdays(trigger, d.daysOffset)
      : (() => { const x = new Date(trigger); x.setDate(x.getDate() + d.daysOffset); return x; })();
    return {
      firmId,
      createdBy: req.user._id,
      matterId:  matterId || undefined,
      title:     d.name,
      description: d.description,
      eventType: 'filing_deadline',
      startDate: date,
      allDay:    true,
      isCourtDate: false,
      sourceRule: rule.triggerEvent,
      status: 'scheduled',
    };
  });

  sendSuccess(res, { rule, preview }, 'Deadline preview generated');
};

exports.confirmDeadlines = async (req, res) => {
  const firmId = getFirmId(req);
  const { events } = req.body;
  if (!Array.isArray(events) || !events.length) return sendError(res, 'No events provided', 400);
  const created = await CalendarEvent.insertMany(
    events.map(e => ({ ...e, firmId, createdBy: req.user._id }))
  );
  sendSuccess(res, created, 'Deadlines created', 201);
};

/* ── Availability ────────────────────────────────────────────────── */

exports.getAvailability = async (req, res) => {
  const avail = await Availability.findOne({ userId: req.user._id }).lean();
  sendSuccess(res, avail || {}, 'Availability');
};

exports.updateAvailability = async (req, res) => {
  const firmId = getFirmId(req);
  const avail = await Availability.findOneAndUpdate(
    { userId: req.user._id },
    { ...req.body, userId: req.user._id, firmId },
    { new: true, upsert: true, runValidators: true }
  );
  sendSuccess(res, avail, 'Availability updated');
};

/* ── Booking (public) ────────────────────────────────────────────── */

exports.getBookingPage = async (req, res) => {
  const avail = await Availability.findOne({ bookingPageSlug: req.params.slug, isPublic: true })
    .populate('userId', 'name email')
    .lean();
  if (!avail) return sendError(res, 'Booking page not found', 404);
  sendSuccess(res, avail, 'Booking page');
};

exports.createBooking = async (req, res) => {
  const avail = await Availability.findOne({ bookingPageSlug: req.params.slug, isPublic: true });
  if (!avail) return sendError(res, 'Booking page not found', 404);

  const { name, email, phone, date, time, description, practiceArea } = req.body;
  if (!name || !email || !date || !time) return sendError(res, 'name, email, date and time required', 400);

  const startDate = new Date(`${date}T${time}:00`);
  const endDate   = new Date(startDate.getTime() + (avail.consultationDuration || 60) * 60000);

  const event = await CalendarEvent.create({
    firmId:      avail.firmId,
    createdBy:   avail.userId,
    title:       `Consultation: ${name}`,
    description: `Phone: ${phone || '—'}\nPractice Area: ${practiceArea || '—'}\n${description || ''}`.trim(),
    eventType:   'appointment',
    startDate,
    endDate,
    attendees:   [{ email }],
    status:      'scheduled',
  });

  sendSuccess(res, event, 'Booking created', 201);
};
