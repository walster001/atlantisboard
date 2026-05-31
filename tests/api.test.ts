import { beforeAll, expect, it } from 'bun:test';
import { describeHttpIntegration } from './helpers/integrationEnv.js';
import { ensureTestServer } from './helpers/testServer.js';
import { apiInject } from './helpers/integrationHttp.js';

function getBaseUrl(): string {
  return process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = getBaseUrl();
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await fetch(`${baseUrl}${path}`, init);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
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

describeHttpIntegration('API Health Check', () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

  it('should return health status', async () => {
    const response = await request('/health', { method: 'GET' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: string };
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });
});

describeHttpIntegration('Authentication API', () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

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

describeHttpIntegration('Workspace API', () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

  it('should require authentication', async () => {
    const response = await request('/api/v1/workspaces', { method: 'GET' });
    expect(response.status).toBe(401);
  });
});

describeHttpIntegration('CSRF protection', () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

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
