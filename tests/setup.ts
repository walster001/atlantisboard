import { beforeAll, afterAll } from 'bun:test';
import {
  hasDbIntegrationDeps,
  DB_INTEGRATION_ENV_DOCS,
  assertDbIntegrationReachable,
  isCiTestRun,
} from './helpers/integrationEnv.js';
import { INTEGRATION_HOOK_TIMEOUT_MS } from './helpers/integrationHooks.js';
import { connectTestDatabase, clearTestDatabase } from './helpers/testHelpers.js';
import { ensureTestServer } from './helpers/testServer.js';

beforeAll(async () => {
  if (!hasDbIntegrationDeps()) {
    console.info(`tests/setup.ts: skipping DB hooks (${DB_INTEGRATION_ENV_DOCS})`);
    return;
  }
  const reachable = await assertDbIntegrationReachable();
  if (!reachable) {
    if (isCiTestRun()) {
      throw new Error(
        `DB integration dependencies were not reachable in CI. ${DB_INTEGRATION_ENV_DOCS}`,
      );
    }
    console.warn(`tests/setup.ts: skipping DB hooks (${DB_INTEGRATION_ENV_DOCS})`);
    return;
  }
  await ensureTestServer();
  await connectTestDatabase();
  await clearTestDatabase({ waitForHttp: false });
}, INTEGRATION_HOOK_TIMEOUT_MS);

afterAll(async () => {
  if (!hasDbIntegrationDeps()) {
    return;
  }
  await clearTestDatabase({ waitForHttp: false });
  // Bun may invoke preload afterAll once per test file; keep mongoose + HTTP server alive.
}, INTEGRATION_HOOK_TIMEOUT_MS);
