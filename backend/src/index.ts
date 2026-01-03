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

// Body parser - Skip JSON parsing for file upload routes (they use multipart/form-data)
app.use((req, res, next) => {
  // Skip JSON parsing for storage upload routes (they need multipart/form-data)
  if (req.path.match(/^\/api\/storage\/.*\/upload$/)) {
    return next();
  }
  // Apply JSON parser for all other routes
  express.json()(req, res, next);
});
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
// Exclude WebSocket upgrade path (/realtime) and all realtime-related endpoints from rate limiting
// Realtime updates should not be rate-limited as they are server-initiated events
// In development, use more lenient limits to avoid hitting limits during testing
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.NODE_ENV === 'development' 
    ? env.RATE_LIMIT_MAX_REQUESTS * 10 // 10x more lenient in development (1000 requests per window)
    : env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for WebSocket upgrade requests
    if (req.path === '/realtime' || req.headers.upgrade === 'websocket') {
      return true;
    }
    
    // Only skip rate limiting for write operations (POST, PATCH, DELETE) on realtime-related endpoints
    // GET requests should still be rate-limited as they don't trigger realtime events
    const method = req.method.toUpperCase();
    const isWriteOperation = method === 'POST' || method === 'PATCH' || method === 'DELETE';
    
    if (!isWriteOperation) {
      return false; // Rate limit all GET requests
    }
    
    // Skip rate limiting for all realtime-related API endpoints that trigger broadcasts
    const path = req.path.toLowerCase();
    
    // Realtime WebSocket path
    if (path.includes('/realtime')) {
      return true;
    }
    
    // Permissions-related tables in /api/db/:table
    // These tables trigger realtime events for permissions updates
    if (path.startsWith('/api/db/')) {
      const table = path.replace('/api/db/', '').split('?')[0].toLowerCase();
      const permissionsTables = [
        'custom_roles',
        'role_permissions',
        'board_member_custom_roles',
        'profiles'
      ];
      if (permissionsTables.includes(table)) {
        return true;
      }
    }
    
    // All write operations on boards endpoints (boards, members, columns, cards, labels, subtasks)
    // Match both /api/boards and /api/boards/* paths
    if (path === '/api/boards' || path.startsWith('/api/boards/')) {
      return true;
    }
    
    // All write operations on cards endpoints
    // Match both /api/cards and /api/cards/* paths
    if (path === '/api/cards' || path.startsWith('/api/cards/')) {
      return true;
    }
    
    // All write operations on columns endpoints
    // Match both /api/columns and /api/columns/* paths
    if (path === '/api/columns' || path.startsWith('/api/columns/')) {
      return true;
    }
    
    // All write operations on labels endpoints
    // Match both /api/labels and /api/labels/* paths
    if (path === '/api/labels' || path.startsWith('/api/labels/')) {
      return true;
    }
    
    // All write operations on subtasks endpoints
    // Match both /api/subtasks and /api/subtasks/* paths
    if (path === '/api/subtasks' || path.startsWith('/api/subtasks/')) {
      return true;
    }
    
    // All write operations on members endpoints (board and workspace members)
    // Match both /api/members and /api/members/* paths
    if (path === '/api/members' || path.startsWith('/api/members/')) {
      return true;
    }
    
    // All write operations on workspaces endpoints (workspaces and workspace members)
    // Match both /api/workspaces and /api/workspaces/* paths
    if (path === '/api/workspaces' || path.startsWith('/api/workspaces/')) {
      return true;
    }
    
    // POST on invites endpoints (invite redemption triggers realtime member events)
    if (path.startsWith('/api/invites/') && method === 'POST') {
      return true;
    }
    
    return false;
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
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

