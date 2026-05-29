import rateLimit, { type Store as RateLimitStore } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import type { OptionalAuthRequest } from '../../shared/types/express.js';

// Redis store for rate limiting
interface ClientRateLimitInfo {
  totalHits: number;
  resetTime: Date;
}

class RedisStore implements RateLimitStore {
  private redis: typeof redis;
  prefix: string;
  /** Window length for new keys / missing TTL (matches express-rate-limit `windowMs`). */
  private readonly windowMs: number;

  constructor(redisClient: typeof redis, prefix: string, windowMs: number) {
    this.redis = redisClient;
    this.prefix = prefix;
    this.windowMs = Math.max(1, windowMs);
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const prefixedKey = this.getKey(key);
    const pipeline = this.redis.pipeline();
    pipeline.incr(prefixedKey);
    pipeline.pttl(prefixedKey);
    const results = await pipeline.exec();
    const first = results?.[0];
    const second = results?.[1];
    if (first == null) {
      throw new Error('Redis rate limit INCR failed');
    }
    if (first[0] != null) {
      const err = first[0];
      throw err instanceof Error ? err : new Error('Redis rate limit INCR failed');
    }
    if (second == null) {
      throw new Error('Redis rate limit PTTL failed');
    }
    if (second[0] != null) {
      const err = second[0];
      throw err instanceof Error ? err : new Error('Redis rate limit PTTL failed');
    }
    const count = first[1] as number;
    const pttlAfterIncr = second[1] as number;
    // Fixed window: only keys without TTL get PEXPIRE (first hit after expiry, or repaired orphans with TTL -1).
    if (pttlAfterIncr === -1) {
      await this.redis.pexpire(prefixedKey, this.windowMs);
    }
    const ttlMs = pttlAfterIncr === -1 ? this.windowMs : pttlAfterIncr > 0 ? pttlAfterIncr : this.windowMs;
    const resetTime = new Date(Date.now() + ttlMs);
    return { totalHits: count, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await this.redis.decr(this.getKey(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.redis.del(this.getKey(key));
  }

  async shutdown(): Promise<void> {
    // Redis store shutdown - no-op for our implementation
  }
}

// Helper function to get IP address — respects Express `trust proxy` via req.ip
function getClientIp(req: Request): string {
  const trustProxy = req.app.get('trust proxy');
  if (trustProxy) {
    const ip = req.ip;
    if (typeof ip === 'string' && ip.length > 0) {
      if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
      }
      return ip;
    }
  }

  const socketAddress = req.socket.remoteAddress;
  if (socketAddress) {
    if (socketAddress.startsWith('::ffff:')) {
      return socketAddress.substring(7);
    }
    return socketAddress;
  }

  return 'unknown';
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseWindowMsFromMinutes(raw: string | undefined, fallbackMinutes: number): number {
  const minutes = parsePositiveInt(raw, fallbackMinutes);
  return minutes * 60 * 1000;
}

function defaultMaxForType(
  type: 'auth' | 'file' | 'api' | 'attachment_stream' | 'attachment_url_mint' | 'board_background',
): number {
  switch (type) {
    case 'auth':
      return parsePositiveInt(process.env.RATE_LIMIT_AUTH_ATTEMPTS, 900);
    case 'file':
      return parsePositiveInt(process.env.RATE_LIMIT_FILE_UPLOADS, 10);
    case 'attachment_stream':
      return parsePositiveInt(process.env.RATE_LIMIT_ATTACHMENT_STREAM_MAX, 600);
    case 'attachment_url_mint':
      return parsePositiveInt(process.env.RATE_LIMIT_ATTACHMENT_URL_MINT_MAX, 90);
    case 'board_background':
      return 300;
    default:
      return parsePositiveInt(process.env.RATE_LIMIT_GENERAL_API, 1000);
  }
}

function defaultWindowMsForType(
  type: 'auth' | 'file' | 'api' | 'attachment_stream' | 'attachment_url_mint' | 'board_background',
): number {
  switch (type) {
    case 'auth':
      return parseWindowMsFromMinutes(process.env.RATE_LIMIT_AUTH_WINDOW, 1);
    case 'file':
      return parseWindowMsFromMinutes(process.env.RATE_LIMIT_FILE_UPLOAD_WINDOW, 1);
    case 'attachment_stream':
      return parseWindowMsFromMinutes(process.env.RATE_LIMIT_ATTACHMENT_STREAM_WINDOW, 1);
    case 'attachment_url_mint':
      return parseWindowMsFromMinutes(process.env.RATE_LIMIT_ATTACHMENT_URL_MINT_WINDOW, 1);
    default:
      return parseWindowMsFromMinutes(process.env.RATE_LIMIT_GENERAL_API_WINDOW, 1);
  }
}

// Rate limit configuration helper (can be enhanced to read from AdminConfig)

export function createRateLimiter(
  type:
    | 'auth'
    | 'file'
    | 'api'
    | 'attachment_stream'
    | 'attachment_url_mint'
    | 'board_background',
  options?: { windowMs?: number; max?: number },
) {
  const maxRequests = options?.max ?? defaultMaxForType(type);
  const windowMs = options?.windowMs ?? defaultWindowMsForType(type);

  // Create unique store instance for each limiter type (TTL aligned with windowMs — no unbounded keys)
  const store = new RedisStore(redis, `ratelimit:${type}`, windowMs);
  
  return rateLimit({
    store,
    windowMs,
    max: maxRequests,
    keyGenerator: (req: Request) => {
      // Rate limit by both user and IP
      const authReq = req as OptionalAuthRequest;
      const userId = authReq.user?.id || 'anonymous';
      const ip = getClientIp(req);
      return `${userId}:${ip}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const authReq = req as OptionalAuthRequest;
      logger.warn(
        {
          event: 'rate_limit.exceeded',
          limiter: type,
          ip: getClientIp(req),
          userId: authReq.user?.id,
        },
        'Rate limit exceeded',
      );
      res.status(429).json({
        error: {
          message: 'Too many requests, please try again later',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
        },
      });
    },
  });
}

/** Per-IP limiter for credential endpoints (mitigates password spraying across accounts — AC-002). */
export function createIpKeyedRateLimiter(
  redisKeyPrefix: string,
  options: { windowMs: number; max: number },
): ReturnType<typeof rateLimit> {
  const windowMs = options.windowMs;
  const store = new RedisStore(redis, `ratelimit:${redisKeyPrefix}`, windowMs);
  return rateLimit({
    store,
    windowMs,
    max: options.max,
    keyGenerator: (req: Request) => `ip:${getClientIp(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn(
        {
          type: redisKeyPrefix,
          ip: getClientIp(req),
        },
        'IP rate limit exceeded',
      );
      res.status(429).json({
        error: {
          message: 'Too many requests, please try again later',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
        },
      });
    },
  });
}

/** Stricter cap on login attempts per IP (15 min window). Stacks with authRateLimiter. */
export const loginIpRateLimiter = createIpKeyedRateLimiter('login_ip', {
  windowMs: 15 * 60 * 1000,
  max: 30,
});

// Pre-configured limiters (will use defaults initially, can be updated)
export const authRateLimiter = createRateLimiter('auth');
export const fileUploadRateLimiter = createRateLimiter('file');
export const apiRateLimiter = createRateLimiter('api');
/** Throttles authenticated attachment/media GETs (video playback can fan out many requests per client). */
export const attachmentStreamRateLimiter = createRateLimiter('attachment_stream');
/** Throttles presigned URL minting (low frequency; distinct from byte streaming). */
export const attachmentUrlMintRateLimiter = createRateLimiter('attachment_url_mint');
/** Board background CDN-style GET is public; limit by caller IP + optional user key. */
export const boardBackgroundDownloadRateLimiter = createRateLimiter('board_background');

