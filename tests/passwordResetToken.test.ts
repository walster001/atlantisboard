import { describe, expect, test } from 'bun:test';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenExpired,
  passwordResetExpiresAt,
} from '../src/server/utils/passwordResetToken.js';

describe('passwordResetToken', () => {
  test('generatePasswordResetToken returns high-entropy url-safe strings', () => {
    const a = generatePasswordResetToken();
    const b = generatePasswordResetToken();
    expect(a.length).toBeGreaterThan(20);
    expect(b.length).toBeGreaterThan(20);
    expect(a).not.toBe(b);
  });

  test('hashPasswordResetToken is deterministic', () => {
    const token = generatePasswordResetToken();
    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
    expect(hashPasswordResetToken(token)).not.toBe(hashPasswordResetToken(generatePasswordResetToken()));
  });

  test('passwordResetExpiresAt is approximately ten minutes ahead', () => {
    const before = Date.now();
    const expiresAt = passwordResetExpiresAt();
    const after = Date.now();
    const ms = expiresAt.getTime();
    expect(ms).toBeGreaterThanOrEqual(before + 9 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(after + 11 * 60 * 1000);
  });

  test('isPasswordResetTokenExpired treats missing and past dates as expired', () => {
    expect(isPasswordResetTokenExpired(undefined)).toBe(true);
    expect(isPasswordResetTokenExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isPasswordResetTokenExpired(new Date(Date.now() + 60_000))).toBe(false);
  });
});
