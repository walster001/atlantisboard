/**
 * HTTP helper for integration tests against the running Express server (see src/server/index.ts).
 * Express has no app.inject(); api.test.ts uses fetch — this adds CSRF + cookie handling for mutating routes.
 */

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let sessionCookie = '';
let csrfToken = '';

function mergeSetCookies(response: Response): void {
  const getSetCookie = response.headers.getSetCookie;
  if (typeof getSetCookie !== 'function') {
    return;
  }
  const parts = getSetCookie
    .call(response.headers)
    .map((entry) => entry.split(';')[0]?.trim() ?? '')
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return;
  }
  const jar = new Map<string, string>();
  for (const existing of sessionCookie.split(';').map((s) => s.trim()).filter(Boolean)) {
    const name = existing.split('=')[0];
    if (name) {
      jar.set(name, existing);
    }
  }
  for (const part of parts) {
    const name = part.split('=')[0];
    if (name) {
      jar.set(name, part);
    }
  }
  sessionCookie = [...jar.values()].join('; ');
}

export function resetIntegrationHttpSession(): void {
  sessionCookie = '';
  csrfToken = '';
}

export async function waitForServer(maxAttempts = 40, delayMs = 150): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError instanceof Error ? lastError : new Error('Server did not become ready');
}

async function refreshCsrfToken(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/v1/csrf/token`, {
    method: 'GET',
    headers: sessionCookie ? { cookie: sessionCookie } : undefined,
  });
  mergeSetCookies(response);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { csrfToken?: string };
  csrfToken = body.csrfToken ?? '';
}

export type ApiInjectOptions = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: unknown;
};

export type ApiInjectResponse = {
  statusCode: number;
  body: string;
};

/**
 * Issue an HTTP request to the app under test (Fastify-style inject replacement).
 */
export async function apiInject(options: ApiInjectOptions): Promise<ApiInjectResponse> {
  await waitForServer();

  const method = options.method.toUpperCase();
  if (!SAFE_METHODS.has(method)) {
    await refreshCsrfToken();
  }

  const headers: Record<string, string> = {
    ...options.headers,
  };
  if (options.payload !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (sessionCookie) {
    headers.cookie = sessionCookie;
  }
  if (!SAFE_METHODS.has(method) && csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const path = options.url.startsWith('/') ? options.url : `/${options.url}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.payload !== undefined ? JSON.stringify(options.payload) : undefined,
  });

  mergeSetCookies(response);
  const body = await response.text();

  return {
    statusCode: response.status,
    body,
  };
}
