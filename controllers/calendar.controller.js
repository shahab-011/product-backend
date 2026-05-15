const CalendarEvent = require('../models/CalendarEvent.model');
const { sendSuccess, sendError } = require('../utils/response');

const EVENT_TYPES = [
  'court_date','hearing','deposition','client_meeting',
  'deadline','conference','call','reminder','other',
];

exports.getEventTypes = (req, res) =>
  sendSuccess(res, EVENT_TYPES, 'Event types');

exports.list = async (req, res) => {
  const { from, to, matterId, eventType, limit = 200 } = req.query;
  const filter = { firmId: req.user._id };
  if (matterId)  filter.matterId  = matterId;
  if (eventType) filter.eventType = eventType;
  if (from || to) {
    filter.startDate = {};
    if (from) filter.startDate.$gte = new Date(from);
    if (to)   filter.startDate.$lte = new Date(to);
  }
  const events = await CalendarEvent.find(filter)
    .populate('matterId', 'title matterNumber')
    .sort({ startDate: 1 })
    .limit(Number(limit))
    .lean();
  sendSuccess(res, events, 'Events fetched');
};

exports.get = async (req, res) => {
  const event = await CalendarEvent.findOne({ _id: req.params.id, firmId: req.user._id })
    .populate('matterId', 'title matterNumber')
    .lean();
  if (!event) return sendError(res, 'Event not found', 404);
  sendSuccess(res, event, 'Event fetched');
};

exports.create = async (req, res) => {
  const event = await CalendarEvent.create({
    ...req.body, firmId: req.user._id, createdBy: req.user._id,
  });
  sendSuccess(res, event, 'Event created', 201);
};

exports.update = async (req, res) => {
  const event = await CalendarEvent.findOneAndUpdate(
    { _id: req.params.id, firmId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!event) return sendError(res, 'Event not found', 404);
  sendSuccess(res, event, 'Event updated');
};

exports.remove = async (req, res) => {
  const event = await CalendarEvent.findOneAndDelete({ _id: req.params.id, firmId: req.user._id });
  if (!event) return sendError(res, 'Event not found', 404);
  sendSuccess(res, null, 'Event deleted');
};
