import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import passport from 'passport';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import dbRoutes from './routes/db.js';
import workspaceRoutes from './routes/workspaces.js';
import boardRoutes from './routes/boards.js';
import columnRoutes from './routes/columns.js';
import cardRoutes from './routes/cards.js';
import labelRoutes from './routes/labels.js';
import subtaskRoutes from './routes/subtasks.js';
import memberRoutes from './routes/members.js';
import appSettingsRoutes from './routes/app-settings.js';
import homeRoutes from './routes/home.js';
import rpcRoutes from './routes/rpc.js';
import storageRoutes from './routes/storage.js';
import inviteRoutes from './routes/invites.js';
import adminRoutes from './routes/admin.js';
import boardImportRoutes from './routes/board-import.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session for OAuth (Passport requires sessions)
app.use(
  session({
    secret: env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting
// Exclude WebSocket upgrade path (/realtime) from rate limiting
// Realtime updates should not be rate-limited as they are server-initiated events
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for WebSocket upgrade requests
    return req.path === '/realtime' || req.headers.upgrade === 'websocket';
  },
});
app.use('/api/', limiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/db', dbRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/subtasks', subtaskRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/app-settings', appSettingsRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/rpc', rpcRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/boards', boardImportRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = env.API_PORT;
// Listen on all interfaces (0.0.0.0) to ensure accessibility via both localhost and 127.0.0.1
const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📝 Environment: ${env.NODE_ENV}`);
  console.log(`🌐 CORS origin: ${env.CORS_ORIGIN}`);
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    console.log(`✅ Google OAuth: Configured`);
  } else {
    console.log(`⚠️  Google OAuth: Not configured (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required)`);
  }
});

// Initialize WebSocket server for realtime
import { initializeRealtime } from './realtime/server.js';
initializeRealtime(server);

