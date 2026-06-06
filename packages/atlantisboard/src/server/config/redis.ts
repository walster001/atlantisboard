import Redis, { Cluster, type ClusterOptions } from 'ioredis';
import { createClient, createCluster } from 'redis';
import type { RedisClientType, RedisClusterType } from 'redis';
import { logger } from '../utils/logger.js';
import {
  buildIoredisTlsOptions,
  getRedisHost,
  getRedisPassword,
  getRedisUsername,
  getRedisStandalonePort,
  isRedisClusterMode,
  isRedisTlsEnabled,
  readRedisTlsCaFromEnv,
  redisClusterUseReplicas,
  redisTlsRejectUnauthorized,
  resolveClusterStartupNodes,
} from './redisSettings.js';

const host = getRedisHost();
const port = getRedisStandalonePort();
const password = getRedisPassword();
const username = getRedisUsername();
const useTls = isRedisTlsEnabled();
const tlsRejectUnauthorized = redisTlsRejectUnauthorized();
const ioredisTls = buildIoredisTlsOptions();
const clusterMode = isRedisClusterMode();
const startupNodes = resolveClusterStartupNodes(host, port);

const ioredisRetry = {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number): number => Math.min(times * 50, 2000),
  reconnectOnError: (err: Error): boolean => err.message.includes('READONLY'),
};

function createIoredisInstance(): Redis | Cluster {
  if (clusterMode) {
    const redisOptions: NonNullable<ClusterOptions['redisOptions']> = {
      maxRetriesPerRequest: ioredisRetry.maxRetriesPerRequest,
      reconnectOnError: ioredisRetry.reconnectOnError,
      ...(password !== undefined && { password }),
      ...(username !== undefined && { username }),
      ...(ioredisTls !== undefined && { tls: ioredisTls }),
    };
    return new Cluster([...startupNodes], {
      redisOptions,
      clusterRetryStrategy(times: number): number {
        return Math.min(100 + times * 2, 2000);
      },
    });
  }
  return new Redis({
    host,
    port,
    ...(password !== undefined && { password }),
    ...(username !== undefined && { username }),
    ...(ioredisTls !== undefined && { tls: ioredisTls }),
    ...ioredisRetry,
  });
}

export const redis = createIoredisInstance();

function buildNodeRedisSocket(hostArg: string, portArg: number): {
  host: string;
  port: number;
  tls?: true;
  rejectUnauthorized?: boolean;
  ca?: Buffer;
} {
  if (!useTls) {
    return { host: hostArg, port: portArg };
  }
  const ca = readRedisTlsCaFromEnv();
  return {
    host: hostArg,
    port: portArg,
    tls: true,
    rejectUnauthorized: tlsRejectUnauthorized,
    ...(ca !== undefined && { ca }),
  };
}

function buildNodeRedisCredentials(): { username?: string; password?: string } {
  return {
    ...(username !== undefined && { username }),
    ...(password !== undefined && { password }),
  };
}

/**
 * Official `redis` (node-redis v5) client for express-session via connect-redis v9.
 * connect-redis expects this client, not ioredis — using ioredis caused SET ... [object Object] / ERR syntax error.
 */
export const sessionRedisClient: RedisClientType | RedisClusterType = clusterMode
  ? createCluster({
      rootNodes: startupNodes.map((n) => ({
        socket: buildNodeRedisSocket(n.host, n.port),
      })),
      defaults: {
        ...buildNodeRedisCredentials(),
      },
      ...(redisClusterUseReplicas() ? { useReplicas: true as const } : {}),
    })
  : createClient({
      socket: buildNodeRedisSocket(host, port),
      ...buildNodeRedisCredentials(),
    });

sessionRedisClient.on('error', (err: Error) => {
  logger.error({ err }, 'Redis session client error');
});

export async function connectSessionRedis(): Promise<void> {
  if (!sessionRedisClient.isOpen) {
    await sessionRedisClient.connect();
    logger.info(
      {
        mode: clusterMode ? 'cluster' : 'standalone',
        tls: useTls,
        discoveryNodes: clusterMode ? startupNodes.length : 1,
      },
      'Redis session client connected',
    );
  }
}

export async function disconnectSessionRedis(): Promise<void> {
  if (sessionRedisClient.isOpen) {
    await sessionRedisClient.quit();
  }
}

export async function disconnectIoredis(): Promise<void> {
  try {
    await redis.quit();
  } catch (err) {
    logger.warn({ err }, 'Redis ioredis quit failed; disconnecting');
    redis.disconnect();
  }
}

redis.on('ready', () => {
  logger.info(
    {
      mode: clusterMode ? 'cluster' : 'standalone',
      tls: useTls,
      discoveryNodes: clusterMode ? startupNodes.length : 1,
    },
    'Redis (ioredis) ready',
  );
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
