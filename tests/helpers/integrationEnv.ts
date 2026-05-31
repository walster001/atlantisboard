/** Documented in tests/README.md and docs/wiki/environment-variables.md */
import { describe } from 'bun:test';

export const DB_INTEGRATION_ENV_DOCS =
  'Set MONGODB_TEST_URI (recommended separate DB) and REDIS_HOST or REDIS_URL for DB-backed integration tests';

export const MONGODB_TEST_ONLY_DOCS =
  'Set MONGODB_TEST_URI for direct Mongoose test helpers (see tests/README.md)';

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
