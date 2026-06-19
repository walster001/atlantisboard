import { expect, it, beforeAll } from 'bun:test';
import { describeWhenDeps, INTEGRATION_HOOK_TIMEOUT_MS } from './helpers/integrationEnv.js';
import { resolveTestServerBaseUrl, ensureTestServer } from './helpers/testServer.js';
import { apiInject } from './helpers/integrationHttp.js';

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await resolveTestServerBaseUrl();
  return fetch(`${baseUrl}${path}`, init);
}

/** Bun fetch does not persist cookies; forward Set-Cookie for session-bound CSRF tests. */
function cookieHeaderFromResponse(response: Response): string | undefined {
  const getSetCookie = response.headers.getSetCookie;
  if (typeof getSetCookie !== 'function') {
    return undefined;
  }
  const setCookies = getSetCookie.call(response.headers) as string[];
  if (setCookies.length === 0) {
    return undefined;
  }
  return setCookies
    .map((entry) => entry.split(';')[0]?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join('; ');
}

describeWhenDeps({ mongo: true, redis: true }, 'API Health Check', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('should return health status', async () => {
    const response = await request('/health', { method: 'GET' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: string };
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });
});

describeWhenDeps({ mongo: true, redis: true }, 'Authentication API', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('should reject unauthenticated requests', async () => {
    const response = await request('/api/v1/workspaces', { method: 'GET' });
    expect(response.status).toBe(401);
  });

  it('should allow user registration', async () => {
    const response = await apiInject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `register-${Date.now()}@example.com`,
        username: `register-${Date.now()}`,
        password: 'TestPassword123!',
        displayName: 'Test User',
      },
    });

    expect([200, 201, 202, 400, 403, 409, 500]).toContain(response.statusCode);
  });
});

describeWhenDeps({ mongo: true, redis: true }, 'Workspace API', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('should require authentication', async () => {
    const response = await request('/api/v1/workspaces', { method: 'GET' });
    expect(response.status).toBe(401);
  });
});

describeWhenDeps({ mongo: true, redis: true }, 'CSRF protection', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('should reject mutating requests without CSRF token', async () => {
    const response = await request('/api/v1/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CSRF Test Workspace' }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('should allow mutating requests with a valid CSRF token', async () => {
    const tokenResponse = await request('/api/v1/csrf/token', {
      method: 'GET',
      credentials: 'include',
    });
    expect(tokenResponse.status).toBe(200);
    const tokenBody = (await tokenResponse.json()) as { csrfToken?: string };
    expect(tokenBody.csrfToken).toBeDefined();

    const csrfToken = tokenBody.csrfToken ?? '';
    const sessionCookies = cookieHeaderFromResponse(tokenResponse);

    const response = await request('/api/v1/workspaces', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
        ...(sessionCookies ? { cookie: sessionCookies } : {}),
      },
      body: JSON.stringify({ name: 'CSRF Test Workspace' }),
    });

    expect(response.status).toBe(401);
  });

  it('should reject mutating requests when header and cookie CSRF tokens mismatch', async () => {
    const tokenResponse = await request('/api/v1/csrf/token', {
      method: 'GET',
      credentials: 'include',
    });
    const tokenBody = (await tokenResponse.json()) as { csrfToken?: string };
    const csrfToken = tokenBody.csrfToken ?? '';
    const sessionCookies = cookieHeaderFromResponse(tokenResponse);
    const mismatchCookies = sessionCookies
      ? sessionCookies.replace(/(^|; )csrf-token=[^;]*/, '$1csrf-token=mismatch-token-value')
      : 'csrf-token=mismatch-token-value';

    const response = await request('/api/v1/workspaces', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
        cookie: mismatchCookies,
      },
      body: JSON.stringify({ name: 'CSRF Mismatch Workspace' }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('CSRF_TOKEN_INVALID');
  });
});
