import { afterEach, describe, expect, it } from 'bun:test';
import { extractTokenFromHandshake } from '../src/server/middleware/auth.js';

/** Public jwt.io HS256 example — not a real session token. */
const VALID_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

describe('extractTokenFromHandshake (Socket.io auth)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers auth.token when present', () => {
    const token = extractTokenFromHandshake(VALID_JWT, undefined, undefined);
    expect(token).toBe(VALID_JWT);
  });

  it('reads Bearer token from Authorization header', () => {
    const token = extractTokenFromHandshake(undefined, `Bearer ${VALID_JWT}`, undefined);
    expect(token).toBe(VALID_JWT);
  });

  it('reads JWT from auth cookie header', () => {
    const token = extractTokenFromHandshake(undefined, undefined, `token=${VALID_JWT}; sessionId=abc`);
    expect(token).toBe(VALID_JWT);
  });

  it('returns null when no JWT-shaped credential is present', () => {
    expect(extractTokenFromHandshake(undefined, undefined, undefined)).toBeNull();
    expect(extractTokenFromHandshake('not-a-jwt', undefined, undefined)).toBeNull();
  });
});
