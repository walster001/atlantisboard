import { describe, expect, it, afterEach } from 'bun:test';
import { assertProductionCorsConfig } from '../src/server/config/cors.js';

describe('assertProductionCorsConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does nothing outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGIN = '*';
    expect(() => assertProductionCorsConfig()).not.toThrow();
  });

  it('throws when production CORS_ORIGIN includes wildcard', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '*';
    expect(() => assertProductionCorsConfig()).toThrow(/CORS_ORIGIN must not include "\*"/);
  });

  it('throws when production CORS_ORIGIN is empty', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    expect(() => assertProductionCorsConfig()).toThrow(/at least one explicit browser origin/);
  });

  it('accepts explicit production origins', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.atlantis.social';
    expect(() => assertProductionCorsConfig()).not.toThrow();
  });
});
