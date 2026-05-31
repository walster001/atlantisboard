import type { IncomingMessage, ServerResponse } from 'node:http';
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
import { startMetricsCollection, stopMetricsCollection } from './services/systemMetricsService.js';
import { initializeMinIOBuckets } from './config/minio.js';
import { initializeRoleDefinitions } from './services/roleService.js';
import { initializeBoardThemes } from './services/boardThemeService.js';
import { dropLegacyUnusedCollections } from './services/startupMigrations.js';
import { migrateLegacyCardDescriptionHtmlBatch } from './services/migrateLegacyCardDescriptionHtmlJob.js';
import {
  getMinioPublicOrigin,
  isSignedAttachmentDeliveryEnabled,
} from './config/attachmentDelivery.js';
import { assertProductionCorsConfig, expressCorsOptions } from './config/cors.js';
import { assertProductionSecrets } from './utils/productionSecrets.js';
import { attachCspNonce, getCspNonceFromResponse } from './middleware/cspNonce.js';
import { renderSpaIndexHtml } from './utils/spaIndex.js';
// Background jobs can run in separate worker process or in main process
// Set ENABLE_CRON_JOBS_IN_MAIN=true to run in main process (default: false, use separate worker)
import { scheduleCronJobs } from './workers/cronJobs.js';
import {
  migrateLegacyUserPlaceholdersToBoardCollection,
  repairWekanEmailStoredInImportUsername,
  sanitizeBoardImportPlaceholderStoredEmails,
} from './services/importPlaceholderUserService.js';

import { initializeVapid } from './config/vapid.js';

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

// Per-request CSP nonce (must run before Helmet)
app.use(attachCspNonce);

// Security middleware — relaxed in dev; strict CSP/HSTS in production
const isProduction = process.env.NODE_ENV === 'production';
const appOrigin = (process.env.APP_URL ?? process.env.CORS_ORIGIN ?? '').replace(/\/$/, '');
const minioPublicOrigin =
  isSignedAttachmentDeliveryEnabled() ? getMinioPublicOrigin() : null;
const cspMediaAndConnectExtras =
  minioPublicOrigin != null && minioPublicOrigin !== '' ? [minioPublicOrigin] : [];

function cspNonceDirective(_req: IncomingMessage, res: ServerResponse): string {
  return `'nonce-${getCspNonceFromResponse(res as express.Response)}'`;
}

app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", cspNonceDirective],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            connectSrc: [
              "'self'",
              ...(appOrigin !== '' ? [appOrigin] : []),
              ...cspMediaAndConnectExtras,
              'wss:',
            ],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: [
              "'self'",
              ...(appOrigin !== '' ? [appOrigin] : []),
              ...cspMediaAndConnectExtras,
            ],
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

// CSRF tokens are issued only via GET /api/v1/csrf/token and after login (not on every response).

// API routes
app.use('/api/v1', apiRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from public directory (index.html served via SPA handler with CSP nonce)
const publicPath = join(process.cwd(), 'public');
app.use(
  express.static(publicPath, {
    index: false,
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
    const nonce = getCspNonceFromResponse(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.send(renderSpaIndexHtml(nonce));
  } catch (err) {
    next(err);
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Setup Socket.io
const io = setupSocketIO(httpServer);

if (process.env.NODE_ENV !== 'test') {
  startMetricsCollection();
}

// Schedule background cron jobs (optional - can run in separate worker process instead)
// Set ENABLE_CRON_JOBS_IN_MAIN=true to enable, or run worker separately: bun run src/server/workers/index.ts
if (process.env.ENABLE_CRON_JOBS_IN_MAIN === 'true') {
  scheduleCronJobs();
  logger.info('Cron jobs scheduled in main process (set ENABLE_CRON_JOBS_IN_MAIN=false to use separate worker)');
} else {
  logger.info('Cron jobs disabled in main process. Start worker separately: bun run src/server/workers/index.ts');
}

let httpServerStartPromise: Promise<number> | null = null;

export function getHttpListenPort(): number {
  const address = httpServer.address();
  if (typeof address === 'object' && address !== null) {
    return address.port;
  }
  return PORT;
}

/** Bootstrap dependencies and listen. Safe to call once; subsequent calls return the same port. */
export async function startHttpServer(options?: {
  readonly port?: number;
  readonly host?: string;
}): Promise<number> {
  if (httpServerStartPromise) {
    return httpServerStartPromise;
  }

  httpServerStartPromise = (async () => {
    if (httpServer.listening) {
      return getHttpListenPort();
    }

    try {
      await connectSessionRedis();
      await connectDatabase();
      await migrateLegacyUserPlaceholdersToBoardCollection();
      await repairWekanEmailStoredInImportUsername();
      await sanitizeBoardImportPlaceholderStoredEmails();
      await dropLegacyUnusedCollections();
      await migrateLegacyCardDescriptionHtmlBatch();
      await initializeBoardThemes();
      await initializeAdminConfig();
      await initializeRoleDefinitions();
      await configureGoogleStrategy();
    } catch (err) {
      logger.error({ err }, 'Server bootstrap failed');
      httpServerStartPromise = null;
      if (process.env.NODE_ENV === 'test') {
        throw err;
      }
      process.exit(1);
    }

    // Non-fatal when object storage is unavailable (e.g. CI without MinIO)
    initializeMinIOBuckets().catch((err) => {
      logger.error({ err }, 'Failed to initialize MinIO buckets');
    });

    initializeVapid().catch((err) => {
      logger.error({ err }, 'Failed to initialize VAPID keys');
    });

    const listenPort = options?.port ?? PORT;
    const listenHost = options?.host ?? HOST;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        httpServer.off('error', onError);
        reject(error);
      };
      httpServer.once('error', onError);
      httpServer.listen(listenPort, listenHost, () => {
        httpServer.off('error', onError);
        const actualPort = getHttpListenPort();
        logger.info(`Server running on http://${listenHost}:${actualPort}`);
        resolve();
      });
    });

    return getHttpListenPort();
  })();

  return httpServerStartPromise;
}

if (import.meta.main) {
  void startHttpServer();
}

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

  stopMetricsCollection();

  const { stopRealtimeEmitMaintenance } = await import('./utils/socketIO.js');
  stopRealtimeEmitMaintenance();

  const { disconnectDatabase } = await import('./config/database.js');
  await disconnectDatabase().catch((error) => {
    logger.error({ error }, 'Error disconnecting MongoDB');
  });

  await new Promise<void>((resolve) => {
    io.close(() => {
      logger.info('Socket.io server closed');
      resolve();
    });
  }).catch((error) => {
    logger.error({ error }, 'Error closing Socket.io');
  });

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

