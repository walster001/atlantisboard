import { beforeAll, afterAll } from 'bun:test';
import {
  hasDbIntegrationDeps,
  DB_INTEGRATION_ENV_DOCS,
  assertDbIntegrationReachable,
  isCiTestRun,
} from './helpers/integrationEnv.js';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from './helpers/testHelpers.js';
import { ensureTestServer } from './helpers/testServer.js';

const GLOBAL_HOOK_TIMEOUT_MS = isCiTestRun() ? 120_000 : 60_000;

beforeAll(async () => {
  if (!hasDbIntegrationDeps()) {
    console.info(`tests/setup.ts: skipping DB hooks (${DB_INTEGRATION_ENV_DOCS})`);
    return;
  }
  const reachable = await assertDbIntegrationReachable();
  if (!reachable) {
    return;
  }
  await ensureTestServer();
  await connectTestDatabase();
  await clearTestDatabase({ waitForHttp: false });
}, GLOBAL_HOOK_TIMEOUT_MS);

afterAll(async () => {
  if (!hasDbIntegrationDeps()) {
    return;
  }
  await clearTestDatabase({ waitForHttp: false });
  await disconnectTestDatabase();
  delete process.env.ATLBOARD_TEST_SERVER_READY;
}, GLOBAL_HOOK_TIMEOUT_MS);
