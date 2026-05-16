require('dotenv').config();
require('express-async-errors');

const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/error.middleware');
const { startCronJobs, runLifecycleScan } = require('./services/cron.service');

const app = express();
const server = http.createServer(app);

const corsOrigin =
  process.env.NODE_ENV === 'development'
    ? /^http:\/\/localhost(:\d+)?$/
    : [
        (process.env.CLIENT_URL || '').replace(/\/$/, ''),
        'https://nayaya-frontend.netlify.app',
      ].filter(Boolean);

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
});

// Make io available to controllers via req.app.get('io')
// (must be set before routes are loaded)
app.set('io', io);

/* ── Socket.io auth middleware ─────────────────────────────────────── */
io.use((socket, next) => {
  const { token, userName } = socket.handshake.auth;
  if (!token) return next(new Error('Unauthorized — no token'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId   = String(decoded.id);
    socket.userName = userName || 'Anonymous';
    next();
  } catch {
    next(new Error('Unauthorized — invalid token'));
  }
});

/* ── Presence map  roomId → Map<socketId, { name, userId }> ─────── */
const roomPresence = new Map();

function broadcastPresence(roomId) {
  const room = roomPresence.get(roomId);
  if (!room) return;
  const users = Array.from(room.values());
  io.to(roomId).emit('presence-update', { users });
}

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id} (${socket.userName})`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
    roomPresence.get(roomId).set(socket.id, { name: socket.userName, userId: socket.userId });
    broadcastPresence(roomId);
    console.log(`📥 ${socket.userName} joined room: ${roomId}`);
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    roomPresence.get(roomId)?.delete(socket.id);
    broadcastPresence(roomId);
  });

  // Client-initiated broadcast (e.g. cursor position, local edits)
  socket.on('document-update', ({ roomId, data }) => {
    socket.to(roomId).emit('document-update', data);
  });

  // Typing indicator — broadcast to everyone else in the room
  socket.on('typing-start', ({ roomId, clauseIndex }) => {
    socket.to(roomId).emit('typing-start', {
      userId:      socket.userId,
      userName:    socket.userName,
      clauseIndex,
    });
  });

  socket.on('typing-stop', ({ roomId }) => {
    socket.to(roomId).emit('typing-stop', { userId: socket.userId });
  });

  // Cursor / scroll position — which clause the user is currently on
  socket.on('cursor-move', ({ roomId, clauseIndex }) => {
    socket.to(roomId).emit('cursor-move', {
      userId:      socket.userId,
      userName:    socket.userName,
      clauseIndex,
    });
  });

  // ── Direct messaging ────────────────────────────────────────────────
  // roomId format: `msg_${linkId}`
  socket.on('join-msg-room', (roomId) => {
    socket.join(roomId);
    console.log(`💬 ${socket.userName} joined msg room: ${roomId}`);
  });

  socket.on('leave-msg-room', (roomId) => {
    socket.leave(roomId);
  });

  // Pure WebSocket send — persist to DB then broadcast to the whole room
  // (sender included so they get the server-confirmed message with real _id)
  socket.on('send-message', async ({ linkId, text }) => {
    if (!text?.trim() || !linkId) return;
    try {
      const ClientLink    = require('./models/ClientLink.model');
      const DirectMessage = require('./models/DirectMessage.model');

      const link = await ClientLink.findById(linkId).lean();
      if (!link) return;

      const uid = String(socket.userId);
      if (String(link.lawyerId) !== uid && String(link.clientId) !== uid) return;

      const role = String(link.lawyerId) === uid ? 'lawyer' : 'client';

      const msg = await DirectMessage.create({
        linkId,
        senderId:   socket.userId,
        senderName: socket.userName,
        senderRole: role,
        text:       text.trim(),
      });

      // Broadcast confirmed message to everyone in room (sender + receiver)
      io.to(`msg_${linkId}`).emit('direct-message', msg.toObject());
    } catch (err) {
      socket.emit('message-error', { error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    // Remove from all rooms and notify peers
    for (const [roomId, users] of roomPresence.entries()) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        broadcastPresence(roomId);
        if (users.size === 0) roomPresence.delete(roomId);
      }
    }
  });
});

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(mongoSanitize());
app.use(xss());

/* ── Rate limiters ─────────────────────────────────────────────────── */

const makeLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,   // sends RateLimit-* headers (RFC 6585)
    legacyHeaders:   false,  // disables deprecated X-RateLimit-* headers
    message: { success: false, message },
  });

// All API routes — broad baseline
app.use('/api/', makeLimiter(
  15 * 60 * 1000, 100,
  'Too many requests — please try again later'
));

// Auth: login — strict (prevents brute-force)
app.use('/api/auth/login', makeLimiter(
  15 * 60 * 1000, 5,
  'Too many login attempts — please try again in 15 minutes'
));

// Auth: register — 10 accounts per hour (prevents mass account creation)
app.use('/api/auth/register', makeLimiter(
  60 * 60 * 1000, 10,
  'Too many registration attempts — please try again in an hour'
));

// AI analysis — costly Gemini calls
app.use('/api/analysis/', makeLimiter(
  15 * 60 * 1000, 15,
  'Too many AI requests — please try again later'
));

/* ── Routes ────────────────────────────────────────────────────────── */

app.use('/api/auth',        require('./routes/auth.routes'));
app.use('/api/documents',   require('./routes/document.routes'));
app.use('/api/analysis',    require('./routes/analysis.routes'));
app.use('/api/alerts',      require('./routes/alert.routes'));
app.use('/api/comparisons', require('./routes/comparison.routes'));
app.use('/api/lawyer',      require('./routes/lawyer.routes'));
app.use('/api/collaboration', require('./routes/collaboration.routes'));
app.use('/api/messages',     require('./routes/messages.routes'));
app.use('/api/graph',        require('./routes/graph.routes'));

/* ── Practice Management ───────────────────────────────────────────── */
app.use('/api/matters',          require('./routes/matters.routes'));
app.use('/api/contacts',         require('./routes/contacts.routes'));
app.use('/api',                  require('./routes/tasks.routes'));
app.use('/api',                  require('./routes/calendar.routes'));
app.use('/api',                  require('./routes/timeTracking.routes'));
app.use('/api',                  require('./routes/billing.routes'));
app.use('/api',                  require('./routes/trust.routes'));
app.use('/api/leads',            require('./routes/leads.routes'));
app.use('/api/communications',   require('./routes/communications.routes'));
app.use('/api',                  require('./routes/templates.routes'));
app.use('/api',                  require('./routes/esign.routes'));
app.use('/api/firm',             require('./routes/firm.routes'));
app.use('/api/conflicts',        require('./routes/conflicts.routes'));
app.use('/api/reports',          require('./routes/reports.routes'));
app.use('/api',                  require('./routes/practiceDocuments.routes'));
app.use('/api',                  require('./routes/portal.routes'));

app.get('/', (req, res) => {
  res.json({ success: true, message: 'NyayaAI API running', version: '1.0.0' });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
});

// Gemini connectivity test — safe to call in any env
app.get('/api/test-gemini', async (req, res) => {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('Say hello in one word.');
    const text = result.response.text();
    return res.json({ success: true, response: text, key_set: !!process.env.GEMINI_API_KEY });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, status: err.status });
  }
});

// Dev-only: trigger the nightly lifecycle scan immediately for testing
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/run-scan', async (req, res) => {
    try {
      await runLifecycleScan();
      res.json({ success: true, message: 'Lifecycle scan triggered — check server console for results' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  startCronJobs();
  server.listen(PORT, () => {
    console.log(`🚀 NyayaAI server running on port ${PORT}`);
  });
});
