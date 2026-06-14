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

  it('throws when production CORS_ALLOW_MISSING_ORIGIN is true', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.atlantis.social';
    process.env.CORS_ALLOW_MISSING_ORIGIN = 'true';
    expect(() => assertProductionCorsConfig()).toThrow(/CORS_ALLOW_MISSING_ORIGIN must not be true/);
  });

  it('throws when production CORS_ORIGIN uses cleartext http', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'http://app.atlantis.social';
    expect(() => assertProductionCorsConfig()).toThrow(/must use https:\/\//);
  });
});
