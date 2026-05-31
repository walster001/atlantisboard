import { isCiTestRun } from './integrationEnv.js';

declare global {
  var __atlboardTestBaseUrl__: string | undefined;
}

let ensurePromise: Promise<string> | null = null;

const HEALTH_FETCH_TIMEOUT_MS = 1_500;

function isIntegrationTestRun(): boolean {
  return process.env.NODE_ENV === 'test' || isCiTestRun();
}

function readCachedBaseUrl(): string | undefined {
  const fromGlobal = globalThis.__atlboardTestBaseUrl__;
  if (typeof fromGlobal === 'string' && fromGlobal.trim() !== '') {
    return fromGlobal.replace(/\/$/, '');
  }
  const fromEnv = process.env.TEST_BASE_URL?.trim();
  if (fromEnv != null && fromEnv !== '') {
    return fromEnv.replace(/\/$/, '');
  }
  return undefined;
}

function publishTestServerBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, '');
  globalThis.__atlboardTestBaseUrl__ = normalized;
  process.env.TEST_BASE_URL = normalized;
  return normalized;
}

export function peekTestServerBaseUrl(): string | undefined {
  return readCachedBaseUrl();
}

export async function resolveTestServerBaseUrl(): Promise<string> {
  const cached = readCachedBaseUrl();
  if (cached != null) {
    return cached;
  }
  return ensureTestServer();
}

async function probeHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(750),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(
  baseUrl: string,
  maxAttempts: number,
  delayMs: number,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Server did not become ready at ${baseUrl}`);
}

/**
 * Start an ephemeral listener (port 0) on the CI runner, or reuse an explicit TEST_BASE_URL.
 * Never probes localhost:3000 when NODE_ENV=test — that is a local dev default, not CI.
 */
export async function ensureTestServer(): Promise<string> {
  const cached = readCachedBaseUrl();
  if (cached != null) {
    return cached;
  }

  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async (): Promise<string> => {
    try {
      const configured = process.env.TEST_BASE_URL?.replace(/\/$/, '');
      if (configured && (await probeHealth(configured))) {
        return publishTestServerBaseUrl(configured);
      }

      const allowDefaultPortReuse = !isIntegrationTestRun();
      if (allowDefaultPortReuse) {
        const defaultPort = Number(process.env.PORT) || 3000;
        const defaultUrl = `http://127.0.0.1:${defaultPort}`;
        if (await probeHealth(defaultUrl)) {
          return publishTestServerBaseUrl(defaultUrl);
        }
      }

      process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
      const { startHttpServer } = await import('../../src/server/index.js');
      const port = await startHttpServer({ port: 0, host: '127.0.0.1' });
      const baseUrl = `http://127.0.0.1:${port}`;
      publishTestServerBaseUrl(baseUrl);
      const waitAttempts = isCiTestRun() ? 80 : 24;
      const waitDelayMs = isCiTestRun() ? 250 : 125;
      await waitForHealth(baseUrl, waitAttempts, waitDelayMs);
      return baseUrl;
    } catch (error) {
      ensurePromise = null;
      throw error;
    }
  })();

  return ensurePromise;
}
