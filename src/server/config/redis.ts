import Redis, { type RedisOptions } from 'ioredis';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';

const redisConfig: RedisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
};

export const redis = new Redis(redisConfig);

/**
 * Official `redis` (node-redis v5) client for express-session via connect-redis v9.
 * connect-redis expects this client, not ioredis — using ioredis caused SET ... [object Object] / ERR syntax error.
 */
export const sessionRedisClient: RedisClientType = createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
});

sessionRedisClient.on('error', (err: Error) => {
  logger.error({ err }, 'Redis session client error');
});

export async function connectSessionRedis(): Promise<void> {
  if (!sessionRedisClient.isOpen) {
    await sessionRedisClient.connect();
    logger.info('Redis session client connected');
  }
}

export async function disconnectSessionRedis(): Promise<void> {
  if (sessionRedisClient.isOpen) {
    await sessionRedisClient.quit();
  }
}

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

