/**
 * Runs before tests/setup.ts (see bunfig.toml). Must not import server code — logger and
 * Redis read LOG_LEVEL / NODE_ENV at module load time.
 */
if (process.env.LOG_LEVEL === undefined || process.env.LOG_LEVEL === '') {
  process.env.LOG_LEVEL = 'warn';
}

if (process.env.NODE_ENV === undefined || process.env.NODE_ENV === '') {
  process.env.NODE_ENV = 'test';
}

/** Obvious test-only values — never use documented production placeholders during `bun test`. */
const TEST_ONLY_JWT_SECRET = 'test-only-jwt-secret-not-for-production-use-32chars';
const TEST_ONLY_MEDIA_SIGN_SECRET = 'test-only-media-sign-secret-not-for-prod-32c';

function ensureTestOnlyEnvSecret(name: string, value: string): void {
  const current = process.env[name]?.trim();
  if (current == null || current === '') {
    process.env[name] = value;
  }
}

if (process.env.NODE_ENV === 'test') {
  ensureTestOnlyEnvSecret('JWT_SECRET', TEST_ONLY_JWT_SECRET);
  ensureTestOnlyEnvSecret('SESSION_SECRET', TEST_ONLY_JWT_SECRET);
  ensureTestOnlyEnvSecret('CSRF_SECRET', TEST_ONLY_JWT_SECRET);
  ensureTestOnlyEnvSecret('ENCRYPTION_KEY', TEST_ONLY_JWT_SECRET);
  ensureTestOnlyEnvSecret('MEDIA_SIGN_SECRET', TEST_ONLY_MEDIA_SIGN_SECRET);
}
