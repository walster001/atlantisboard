import { beforeAll } from 'bun:test';
import { isCiTestRun } from './integrationEnv.js';
import { ensureTestServer } from './testServer.js';

/** Bun defaults hook timeout to 5s; server bootstrap needs longer in CI. */
export const INTEGRATION_HOOK_TIMEOUT_MS = isCiTestRun() ? 120_000 : 60_000;

export function beforeAllEnsureTestServer(): void {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);
}
