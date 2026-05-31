import { waitForServer } from './integrationHttp.js';

let ensurePromise: Promise<string> | null = null;

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

/**
 * Reuse an already-running server (e.g. dev on :3000) or start one ephemeral listener (port 0).
 * Sets process.env.TEST_BASE_URL for integrationHttp helpers.
 */
export async function ensureTestServer(): Promise<string> {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    const configured = process.env.TEST_BASE_URL?.replace(/\/$/, '');
    if (configured && (await probeHealth(configured))) {
      return configured;
    }

    const defaultPort = Number(process.env.PORT) || 3000;
    const defaultUrl = `http://127.0.0.1:${defaultPort}`;
    if (await probeHealth(defaultUrl)) {
      process.env.TEST_BASE_URL = defaultUrl;
      return defaultUrl;
    }

    process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
    const { startHttpServer } = await import('../../src/server/index.js');
    const port = await startHttpServer({ port: 0, host: '127.0.0.1' });
    const baseUrl = `http://127.0.0.1:${port}`;
    process.env.TEST_BASE_URL = baseUrl;
    await waitForServer(40, 150, baseUrl);
    return baseUrl;
  })();

  return ensurePromise;
}
