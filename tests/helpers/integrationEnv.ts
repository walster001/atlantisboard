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
  // Local dev must set MONGODB_TEST_URI — never fall back to MONGODB_URI (would wipe kanboard).
  if (process.env.NODE_ENV === 'test' && isCiTestRun()) {
    return process.env.MONGODB_URI?.trim() || undefined;
  }
  return undefined;
}

export function databaseNameFromMongoUri(rawUri: string): string {
  const normalized = normalizeMongoDatabaseTarget(rawUri);
  const slash = normalized.indexOf('/');
  if (slash < 0) {
    return '';
  }
  return normalized.slice(slash + 1).split('?')[0] ?? '';
}

/** Dev database name — must never be cleared by test helpers locally. */
export const DEV_MONGO_DATABASE_NAME = 'kanboard' as const;

/** Host, port, and database name — used to detect test URI accidentally pointing at dev data. */
export function normalizeMongoDatabaseTarget(rawUri: string): string {
  const uri = rawUri.trim();
  if (uri === '') {
    return '';
  }
  try {
    const isSrv = uri.startsWith('mongodb+srv://');
    const forUrl = isSrv
      ? uri.replace(/^mongodb\+srv:\/\//, 'https://')
      : uri.replace(/^mongodb:\/\//, 'http://');
    const parsed = new URL(forUrl);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port !== '' ? parsed.port : isSrv ? '' : '27017';
    const dbSegment = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
    const hostPort = port !== '' ? `${host}:${port}` : host;
    return `${hostPort}/${dbSegment}`;
  } catch {
    return uri;
  }
}

export function testMongoUriTargetsDevDatabase(testUri: string, devUri: string): boolean {
  const normalizedTest = normalizeMongoDatabaseTarget(testUri);
  const normalizedDev = normalizeMongoDatabaseTarget(devUri);
  if (normalizedTest === '' || normalizedDev === '') {
    return false;
  }
  return normalizedTest === normalizedDev;
}

/**
 * Throws when integration tests would wipe the same Mongo database as MONGODB_URI (local dev).
 * CI is exempt — ephemeral runners use a disposable database for both app and tests.
 */
export function assertSafeTestMongoUriForDestructiveOps(): void {
  if (isCiTestRun()) {
    return;
  }
  const testUri = resolveTestMongoUri();
  const devUri = process.env.MONGODB_URI?.trim();
  if (testUri == null || testUri === '') {
    throw new Error(
      'Refusing to clear MongoDB during tests: MONGODB_TEST_URI is not set. ' +
        'Use a separate database (e.g. mongodb://localhost:27017/kanboard_test?replicaSet=rs0).',
    );
  }
  if (devUri == null || devUri === '') {
    return;
  }
  const testDb = databaseNameFromMongoUri(testUri);
  if (testDb === DEV_MONGO_DATABASE_NAME) {
    throw new Error(
      `Refusing to clear MongoDB during tests: test URI targets the dev database "${DEV_MONGO_DATABASE_NAME}". ` +
        'Use kanboard_test (or another non-production database name).',
    );
  }
  if (testMongoUriTargetsDevDatabase(testUri, devUri)) {
    if (testDb === DEV_MONGO_DATABASE_NAME) {
      throw new Error(
        'Refusing to clear MongoDB during tests: MONGODB_TEST_URI targets the same database as MONGODB_URI. ' +
          'Use a separate database (e.g. mongodb://localhost:27017/kanboard_test?replicaSet=rs0). ' +
          `Resolved target: ${normalizeMongoDatabaseTarget(testUri)}`,
      );
    }
    // Both URIs point at the same non-dev database (e.g. tests/setup aligned MONGODB_URI to MONGODB_TEST_URI).
  }
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
  const maxAttempts = isCiTestRun() ? 8 : 1;
  const delayMs = isCiTestRun() ? 2_000 : 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const [mongoOk, redisOk] = await Promise.all([
      mongoUri ? probeMongoReachable(mongoUri) : Promise.resolve(false),
      probeRedisReachable(),
    ]);
    if (mongoOk && redisOk) {
      return true;
    }
    if (attempt < maxAttempts) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
      continue;
    }
    const parts: string[] = [];
    if (!mongoOk) {
      parts.push(`MongoDB not reachable at ${mongoUri ?? '(no URI)'}`);
    }
    if (!redisOk) {
      parts.push('Redis not reachable (check REDIS_HOST/REDIS_URL)');
    }
    console.warn(`tests: DB integration deps unavailable — ${parts.join('; ')}. ${DB_INTEGRATION_ENV_DOCS}`);
    return false;
  }
  return false;
}
