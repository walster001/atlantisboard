import crypto from 'node:crypto';
import { expect, it, beforeAll } from 'bun:test';
import { describeWhenDeps, INTEGRATION_HOOK_TIMEOUT_MS } from './helpers/integrationEnv.js';
import { ensureTestServer } from './helpers/testServer.js';
import { apiInject, resetIntegrationHttpSession } from './helpers/integrationHttp.js';
import { resolveTestServerBaseUrl } from './helpers/testServer.js';
import { User } from '../src/server/models/User.js';
import { hashPassword } from '../src/server/utils/password.js';

async function createUnverifiedUserWithToken(): Promise<{ email: string; token: string }> {
  const nonce = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const email = `verify-${nonce}@example.com`;
  const token = crypto.randomBytes(32).toString('base64url');
  const passwordHash = await hashPassword('TestPassword123!');

  const user = new User({
    email,
    username: `verify-${nonce}`,
    displayName: 'Verify Test User',
    passwordHash,
    emailVerified: false,
    verificationToken: token,
    verificationTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  await user.save();

  return { email, token };
}

describeWhenDeps({ mongo: true, redis: true }, 'Email verification API', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('should reject GET /auth/verify-email (no state change via GET)', async () => {
    resetIntegrationHttpSession();
    const { token } = await createUnverifiedUserWithToken();

    const response = await apiInject({
      method: 'GET',
      url: `/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`,
    });

    expect(response.statusCode).toBe(405);
    const body = JSON.parse(response.body) as { error?: { code?: string } };
    expect(body.error?.code).toBe('METHOD_NOT_ALLOWED');

    const user = await User.findOne({ verificationToken: token });
    expect(user?.emailVerified).toBe(false);
  });

  it('should reject POST /auth/verify-email without CSRF token', async () => {
    resetIntegrationHttpSession();
    const { token } = await createUnverifiedUserWithToken();

    const baseUrl = await resolveTestServerBaseUrl();

    const response = await fetch(`${baseUrl}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('CSRF_TOKEN_MISSING');

    const user = await User.findOne({ verificationToken: token });
    expect(user?.emailVerified).toBe(false);
  });

  it('should verify email via POST /auth/verify-email with CSRF', async () => {
    resetIntegrationHttpSession();
    const { email, token } = await createUnverifiedUserWithToken();

    const response = await apiInject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      user?: { email?: string; emailVerified?: boolean };
      token?: string;
    };
    expect(body.user?.email).toBe(email);
    expect(body.user?.emailVerified).toBe(true);
    expect(typeof body.token).toBe('string');

    const user = await User.findOne({ email });
    expect(user?.emailVerified).toBe(true);
    expect(user?.verificationToken).toBeUndefined();
  });

  it('should reject POST /auth/verify-email with invalid token', async () => {
    resetIntegrationHttpSession();

    const response = await apiInject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: 'invalid-token-value' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_TOKEN');
  });
});
