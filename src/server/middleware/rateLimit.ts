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

// Helper function to get IP address with IPv6 support
function getClientIp(req: Request): string {
  // Check various headers for IP address (for proxies/load balancers)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (typeof forwarded === 'object' && forwarded !== null && forwarded[0]) {
    return forwarded[0].trim();
  }
  
  // Check x-real-ip header
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp;
  }
  
  // Fallback to socket address
  const socketAddress = req.socket.remoteAddress;
  if (socketAddress) {
    // Handle IPv6 mapped IPv4 addresses
    if (socketAddress.startsWith('::ffff:')) {
      return socketAddress.substring(7);
    }
    return socketAddress;
  }
  
  return 'unknown';
}

// Rate limit configuration helper (can be enhanced to read from AdminConfig)

export function createRateLimiter(
  type: 'auth' | 'file' | 'api' | 'attachment_stream' | 'board_background',
  options?: { windowMs?: number; max?: number }
) {
  const maxRequests =
    options?.max ??
    (type === 'auth'
      ? 900
      : type === 'file'
        ? 10
        : type === 'attachment_stream'
          ? 600
          : type === 'board_background'
            ? 300
            : 1000);
  const windowMs = options?.windowMs ?? 60000;

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
          type,
          ip: getClientIp(req),
          userId: authReq.user?.id,
        },
        'Rate limit exceeded'
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

// Pre-configured limiters (will use defaults initially, can be updated)
export const authRateLimiter = createRateLimiter('auth');
export const fileUploadRateLimiter = createRateLimiter('file');
export const apiRateLimiter = createRateLimiter('api');
/** Throttles authenticated attachment/media GETs (video playback can fan out many requests per client). */
export const attachmentStreamRateLimiter = createRateLimiter('attachment_stream');
/** Board background CDN-style GET is public; limit by caller IP + optional user key. */
export const boardBackgroundDownloadRateLimiter = createRateLimiter('board_background');

