import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRoutes } from './routes/index.js';
import { connectDatabase } from './config/database.js';
import { initializeAdminConfig } from './models/AdminConfig.js';
import { connectSessionRedis } from './config/redis.js';
import { sessionMiddleware } from './middleware/session.js';
import { configureGoogleStrategy, passport } from './config/passport.js';
import { setupSocketIO } from './sockets/index.js';
import { initializeMinIOBuckets } from './config/minio.js';
import { initializeRoleDefinitions } from './services/roleService.js';
import { initializeBoardThemes } from './services/boardThemeService.js';
import { dropLegacyUnusedCollections } from './services/startupMigrations.js';
import { assertProductionCorsConfig, expressCorsOptions } from './config/cors.js';
import { assertProductionSecrets } from './utils/productionSecrets.js';
// Background jobs can run in separate worker process or in main process
// Set ENABLE_CRON_JOBS_IN_MAIN=true to run in main process (default: false, use separate worker)
import { scheduleCronJobs } from './workers/cronJobs.js';
import {
  migrateLegacyUserPlaceholdersToBoardCollection,
  repairWekanEmailStoredInImportUsername,
  sanitizeBoardImportPlaceholderStoredEmails,
} from './services/importPlaceholderUserService.js';

// Connect to database on startup
connectDatabase()
  .then(() => migrateLegacyUserPlaceholdersToBoardCollection())
  .then(() => repairWekanEmailStoredInImportUsername())
  .then(() => sanitizeBoardImportPlaceholderStoredEmails())
  .then(() => dropLegacyUnusedCollections())
  .then(() => initializeBoardThemes())
  .catch((err) => {
    logger.error({ err }, 'Failed to connect to database or run startup migrations');
    process.exit(1);
  });

// Initialize admin config on startup
initializeAdminConfig().catch((err) => {
  logger.error({ err }, 'Failed to initialize admin config');
});

// Initialize built-in roles on startup
initializeRoleDefinitions().catch((err) => {
  logger.error({ err }, 'Failed to initialize role definitions');
});

// Initialize MinIO buckets on startup
initializeMinIOBuckets().catch((err) => {
  logger.error({ err }, 'Failed to initialize MinIO buckets');
});

// Initialize VAPID keys for push notifications
import { initializeVapid } from './config/vapid.js';
initializeVapid().catch((err) => {
  logger.error({ err }, 'Failed to initialize VAPID keys');
});

assertProductionSecrets();
assertProductionCorsConfig();

const app = express();
const httpServer = createServer(app);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

if (process.env.NODE_ENV === 'production') {
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.set('trust proxy', Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : 1);
}

// Security middleware — relaxed in dev; strict CSP/HSTS in production
const isProduction = process.env.NODE_ENV === 'production';
const appOrigin = (process.env.APP_URL ?? process.env.CORS_ORIGIN ?? '').replace(/\/$/, '');

app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            connectSrc: [
              "'self'",
              ...(appOrigin !== '' ? [appOrigin] : []),
              'wss:',
            ],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", ...(appOrigin !== '' ? [appOrigin] : [])],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: null,
          },
        },
    strictTransportSecurity: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors(expressCorsOptions)
);

// Cookie parser
app.use(cookieParser());

// Session middleware (after cookie parser)
app.use(sessionMiddleware);

// Initialize Passport and restore authentication state
app.use(passport.initialize());
app.use(passport.session());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CSRF token middleware - attach token to all responses
import { attachCSRFToken } from './middleware/csrf.js';
app.use(attachCSRFToken);

// API routes
app.use('/api/v1', apiRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from public directory
const publicPath = join(process.cwd(), 'public');
app.use(
  express.static(publicPath, {
    setHeaders(res, filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.endsWith('/sw.js')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }
      if (
        normalized.endsWith('/index.html') ||
        normalized.endsWith('/index.js') ||
        normalized.endsWith('/index.css')
      ) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  })
);

// SPA fallback - serve index.html for all non-API routes
app.use((req, res, next) => {
  // Skip API routes and static file requests
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  // Check if it's a file request (has extension)
  const hasExtension = /\.\w+$/.test(req.path);
  if (hasExtension) {
    return next();
  }
  try {
    res.sendFile(join(publicPath, 'index.html'));
  } catch (err) {
    next(err);
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Setup Socket.io
const io = setupSocketIO(httpServer);

// Schedule background cron jobs (optional - can run in separate worker process instead)
// Set ENABLE_CRON_JOBS_IN_MAIN=true to enable, or run worker separately: bun run src/server/workers/index.ts
if (process.env.ENABLE_CRON_JOBS_IN_MAIN === 'true') {
  scheduleCronJobs();
  logger.info('Cron jobs scheduled in main process (set ENABLE_CRON_JOBS_IN_MAIN=false to use separate worker)');
} else {
  logger.info('Cron jobs disabled in main process. Start worker separately: bun run src/server/workers/index.ts');
}

async function bootstrap(): Promise<void> {
  try {
    await connectSessionRedis();
    await connectDatabase();
    await initializeAdminConfig();
    await initializeRoleDefinitions();
    await configureGoogleStrategy();
  } catch (err) {
    logger.error({ err }, 'Server bootstrap failed');
    process.exit(1);
    return;
  }

  httpServer.listen(PORT, HOST, () => {
    logger.info(`Server running on http://${HOST}:${PORT}`);
  });
}

void bootstrap();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Server received SIGTERM, shutting down gracefully');
  shutdown();
});

process.on('SIGINT', () => {
  logger.info('Server received SIGINT, shutting down gracefully');
  shutdown();
});

async function shutdown(): Promise<void> {
  const { disconnectSessionRedis, disconnectIoredis } = await import('./config/redis.js');
  await disconnectSessionRedis().catch((error) => {
    logger.error({ error }, 'Error closing Redis session client');
  });
  await disconnectIoredis().catch((error) => {
    logger.error({ error }, 'Error closing Redis ioredis client');
  });

  // Close change streams
  const { closeChangeStreams } = await import('./sockets/changeStreams.js');
  await closeChangeStreams().catch((error) => {
    logger.error({ error }, 'Error closing change streams');
  });

  // Cleanup cron jobs if running in main process
  if (process.env.ENABLE_CRON_JOBS_IN_MAIN === 'true') {
    const { cleanupCronJobs } = await import('./workers/cronJobs.js');
    cleanupCronJobs();
  }

  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

export { app, httpServer, io };

