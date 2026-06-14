import { afterEach, describe, expect, it } from 'bun:test';
import type { Request } from 'express';
import { extractAuthToken } from '../src/server/middleware/auth.js';

/** Public jwt.io HS256 example — not a real session token; used only to test extraction shape. */
const VALID_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

function mockRequest(parts: {
  authorization?: string;
  cookies?: Record<string, string>;
  query?: Record<string, string>;
}): Request {
  return {
    headers: parts.authorization != null ? { authorization: parts.authorization } : {},
    cookies: parts.cookies,
    query: parts.query ?? {},
  } as unknown as Request;
}

describe('extractAuthToken', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reads Bearer tokens from Authorization header in all environments', () => {
    process.env.NODE_ENV = 'production';
    const token = extractAuthToken(mockRequest({ authorization: `Bearer ${VALID_JWT}` }));
    expect(token).toBe(VALID_JWT);
  });

  it('reads JWT from auth cookie in all environments', () => {
    process.env.NODE_ENV = 'production';
    const token = extractAuthToken(mockRequest({ cookies: { token: VALID_JWT } }));
    expect(token).toBe(VALID_JWT);
  });

  it('allows ?token= query JWT outside production', () => {
    process.env.NODE_ENV = 'development';
    const token = extractAuthToken(mockRequest({ query: { token: VALID_JWT } }));
    expect(token).toBe(VALID_JWT);
  });

  it('ignores ?token= query JWT in production', () => {
    process.env.NODE_ENV = 'production';
    const token = extractAuthToken(mockRequest({ query: { token: VALID_JWT } }));
    expect(token).toBeNull();
  });
});
