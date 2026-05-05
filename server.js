require('dotenv').config();
require('express-async-errors');

const express = require('express');
const http = require('http');
const cors = require('cors');
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

app.get('/', (req, res) => {
  res.json({ success: true, message: 'NyayaAI API running', version: '1.0.0' });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
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
