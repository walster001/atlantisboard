import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_JWT_EXPIRES_IN,
  authCookieMaxAgeMs,
  getJwtExpiresInFromEnv,
  parseJwtExpiryToMs,
  parseJwtExpiryToSeconds,
} from '../src/server/utils/jwtExpiry.js';

describe('jwtExpiry', () => {
  test('default is 1 day', () => {
    expect(DEFAULT_JWT_EXPIRES_IN).toBe('1d');
    expect(parseJwtExpiryToMs('1d')).toBe(86_400_000);
  });

  test('parses unit suffixes', () => {
    expect(parseJwtExpiryToMs('10m')).toBe(600_000);
    expect(parseJwtExpiryToMs('1h')).toBe(3_600_000);
  });

  test('parses bare integer as seconds (jsonwebtoken compatible)', () => {
    expect(parseJwtExpiryToMs('600')).toBe(600_000);
    expect(parseJwtExpiryToSeconds('600')).toBe(600);
  });

  test('getJwtExpiresInFromEnv falls back when unset', () => {
    const previous = process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_EXPIRES_IN;
    expect(getJwtExpiresInFromEnv()).toBe('1d');
    expect(authCookieMaxAgeMs()).toBe(86_400_000);
    if (previous !== undefined) {
      process.env.JWT_EXPIRES_IN = previous;
    }
  });
});
