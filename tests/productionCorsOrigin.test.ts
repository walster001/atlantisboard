import { describe, expect, it, afterEach } from 'bun:test';
import { isAllowedCorsOrigin } from '../src/server/config/cors.js';

describe('isAllowedCorsOrigin missing Origin', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows missing Origin in development', () => {
    process.env.NODE_ENV = 'development';
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
    expect(isAllowedCorsOrigin('')).toBe(true);
  });

  it('rejects missing Origin in production by default', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com';
    delete process.env.CORS_ALLOW_MISSING_ORIGIN;
    expect(isAllowedCorsOrigin(undefined)).toBe(false);
    expect(isAllowedCorsOrigin('')).toBe(false);
  });

  it('allows missing Origin in production when CORS_ALLOW_MISSING_ORIGIN=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com';
    process.env.CORS_ALLOW_MISSING_ORIGIN = 'true';
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
  });
});
