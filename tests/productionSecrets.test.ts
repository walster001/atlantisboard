import { describe, it, expect, afterEach } from 'bun:test';
import { assertProductionSecrets } from '../src/server/utils/productionSecrets.js';

describe('assertProductionSecrets', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does nothing outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'short';
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('throws when production secrets are missing or insecure', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'your-secret-key-change-in-production';
    process.env.SESSION_SECRET = 'your-session-secret-change-in-production';
    process.env.CSRF_SECRET = 'change-this-csrf-secret-in-production';
    process.env.ENCRYPTION_KEY = 'change-this-to-a-secure-random-string-in-production';

    expect(() => assertProductionSecrets()).toThrow(/Production startup blocked/);
  });

  it('accepts secrets that meet minimum length and are not placeholders', () => {
    process.env.NODE_ENV = 'production';
    const secure = 'a'.repeat(48);
    process.env.JWT_SECRET = secure;
    process.env.SESSION_SECRET = secure;
    process.env.CSRF_SECRET = secure;
    process.env.ENCRYPTION_KEY = secure;

    expect(() => assertProductionSecrets()).not.toThrow();
  });
});
