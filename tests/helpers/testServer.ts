import { isCiTestRun } from './integrationEnv.js';
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
 * Start an ephemeral listener (port 0) for tests, or reuse TEST_BASE_URL when set explicitly.
 * Does not probe :3000 under NODE_ENV=test — a local dev server often uses different secrets.
 */
export async function ensureTestServer(): Promise<string> {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async (): Promise<string> => {
    try {
      const configured = process.env.TEST_BASE_URL?.replace(/\/$/, '');
      if (configured && (await probeHealth(configured))) {
        process.env.ATLBOARD_TEST_SERVER_READY = '1';
        return configured;
      }

      const allowDefaultPortReuse = process.env.NODE_ENV !== 'test';
      if (allowDefaultPortReuse) {
        const defaultPort = Number(process.env.PORT) || 3000;
        const defaultUrl = `http://127.0.0.1:${defaultPort}`;
        if (await probeHealth(defaultUrl)) {
          process.env.TEST_BASE_URL = defaultUrl;
          process.env.ATLBOARD_TEST_SERVER_READY = '1';
          return defaultUrl;
        }
      }

      process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
      const { startHttpServer } = await import('../../src/server/index.js');
      const port = await startHttpServer({ port: 0, host: '127.0.0.1' });
      const baseUrl = `http://127.0.0.1:${port}`;
      process.env.TEST_BASE_URL = baseUrl;
      const waitAttempts = isCiTestRun() ? 80 : 24;
      const waitDelayMs = isCiTestRun() ? 250 : 125;
      await waitForServer(waitAttempts, waitDelayMs, baseUrl);
      process.env.ATLBOARD_TEST_SERVER_READY = '1';
      return baseUrl;
    } catch (error) {
      ensurePromise = null;
      throw error;
    }
  })();

  return ensurePromise;
}
