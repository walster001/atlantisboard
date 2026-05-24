import { describe, expect, test } from 'bun:test';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-jwt-secret-with-enough-entropy-for-hs256';

describe('verifyToken', () => {
  test('rejects alg:none tokens', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        userId: 'abc',
        email: 'a@b.com',
        username: 'user',
        jti: 'jti-1',
      }),
    ).toString('base64url');
    const token = `${header}.${payload}.`;

    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
    const { verifyToken } = await import('../src/server/utils/jwt.js');

    const result = await verifyToken(token);
    expect(result).toBeNull();

    process.env.JWT_SECRET = previousSecret;
  });

  test('accepts valid HS256 tokens with jti', async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
    const { verifyToken } = await import('../src/server/utils/jwt.js');

    const token = jwt.sign(
      {
        userId: 'user-1',
        email: 'user@example.com',
        username: 'user1',
        jti: 'jti-valid',
      },
      TEST_SECRET,
      {
        algorithm: 'HS256',
        issuer: 'kanboard',
        audience: 'kanboard-users',
        expiresIn: '5m',
      },
    );

    const result = await verifyToken(token);
    expect(result?.userId).toBe('user-1');
    expect(result?.jti).toBe('jti-valid');

    process.env.JWT_SECRET = previousSecret;
  });
});
