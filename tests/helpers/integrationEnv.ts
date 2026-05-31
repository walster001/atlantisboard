/** Documented in tests/README.md and docs/wiki/environment-variables.md */
import { connect as connectTcp } from 'node:net';
import { describe } from 'bun:test';
import { MongoClient } from 'mongodb';

export const DB_INTEGRATION_ENV_DOCS =
  'Set MONGODB_TEST_URI (recommended separate DB) and REDIS_HOST or REDIS_URL for DB-backed integration tests';

export const MONGODB_TEST_ONLY_DOCS =
  'Set MONGODB_TEST_URI for direct Mongoose test helpers (see tests/README.md)';

const MONGO_PROBE_TIMEOUT_MS = 4_000;
const REDIS_PROBE_TIMEOUT_MS = 2_000;

export function isCiTestRun(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

export function hasRedisForTests(): boolean {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    return true;
  }
  const redisHost = process.env.REDIS_HOST?.trim();
  return Boolean(redisHost);
}

export function hasMongoTestUri(): boolean {
  return typeof process.env.MONGODB_TEST_URI === 'string' && process.env.MONGODB_TEST_URI.trim() !== '';
}

export function hasMongoForTests(): boolean {
  return Boolean(resolveTestMongoUri());
}

export function hasDbIntegrationDeps(): boolean {
  return hasMongoTestUri() && hasRedisForTests();
}

export function hasHttpIntegrationDeps(): boolean {
  return hasMongoForTests() && hasRedisForTests();
}

/**
 * HTTP integration tests (server + Redis + Mongo via MONGODB_URI or MONGODB_TEST_URI).
 */
export function describeHttpIntegration(name: string, fn: () => void): void {
  const describeFn = hasHttpIntegrationDeps() ? describe : describe.skip;
  const label = hasHttpIntegrationDeps()
    ? name
    : `${name} (skipped: set MONGODB_URI or MONGODB_TEST_URI plus REDIS_HOST or REDIS_URL — see tests/README.md)`;
  describeFn(label, fn);
}

/**
 * Run integration tests when Mongo test URI and Redis are configured; otherwise skip the suite
 * with an explicit label (avoids silent 3s health-check hangs).
 */
export function describeDbIntegration(name: string, fn: () => void): void {
  const describeFn = hasDbIntegrationDeps() ? describe : describe.skip;
  const label = hasDbIntegrationDeps() ? name : `${name} (skipped: ${DB_INTEGRATION_ENV_DOCS})`;
  describeFn(label, fn);
}

export function describeMongoTest(name: string, fn: () => void): void {
  const describeFn = hasMongoTestUri() ? describe : describe.skip;
  const label = hasMongoTestUri() ? name : `${name} (skipped: ${MONGODB_TEST_ONLY_DOCS})`;
  describeFn(label, fn);
}

export function resolveTestMongoUri(): string | undefined {
  const testUri = process.env.MONGODB_TEST_URI?.trim();
  if (testUri) {
    return testUri;
  }
  if (process.env.NODE_ENV === 'test') {
    return process.env.MONGODB_URI?.trim() || undefined;
  }
  return undefined;
}

function resolveRedisProbeTarget(): { host: string; port: number } | null {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname;
      const port = parsed.port ? Number.parseInt(parsed.port, 10) : 6379;
      if (host && Number.isFinite(port)) {
        return { host, port };
      }
    } catch {
      return null;
    }
  }
  const host = process.env.REDIS_HOST?.trim();
  if (!host) {
    return null;
  }
  const portRaw = process.env.REDIS_PORT?.trim();
  const port = portRaw ? Number.parseInt(portRaw, 10) : 6379;
  return Number.isFinite(port) ? { host, port } : null;
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = connectTcp({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** Fast fail-fast probe before Mongoose connect (avoids 30s serverSelection hangs in CI). */
export async function probeMongoReachable(uri?: string): Promise<boolean> {
  const target = uri ?? resolveTestMongoUri();
  if (!target) {
    return false;
  }
  const client = new MongoClient(target, {
    serverSelectionTimeoutMS: MONGO_PROBE_TIMEOUT_MS,
    connectTimeoutMS: MONGO_PROBE_TIMEOUT_MS,
  });
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function probeRedisReachable(): Promise<boolean> {
  const target = resolveRedisProbeTarget();
  if (!target) {
    return false;
  }
  return probeTcp(target.host, target.port, REDIS_PROBE_TIMEOUT_MS);
}

/** Fast fail-fast probe before Mongoose connect (avoids 30s serverSelection hangs). */
export async function assertDbIntegrationReachable(): Promise<boolean> {
  if (!hasMongoTestUri() || !hasRedisForTests()) {
    return false;
  }
  const mongoUri = resolveTestMongoUri();
  const [mongoOk, redisOk] = await Promise.all([
    mongoUri ? probeMongoReachable(mongoUri) : Promise.resolve(false),
    probeRedisReachable(),
  ]);
  if (!mongoOk || !redisOk) {
    const parts: string[] = [];
    if (!mongoOk) {
      parts.push(`MongoDB not reachable at ${mongoUri ?? '(no URI)'}`);
    }
    if (!redisOk) {
      parts.push('Redis not reachable (check REDIS_HOST/REDIS_URL)');
    }
    console.warn(`tests: DB integration deps unavailable — ${parts.join('; ')}. ${DB_INTEGRATION_ENV_DOCS}`);
  }
  return mongoOk && redisOk;
}
