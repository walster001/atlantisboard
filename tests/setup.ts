import { beforeAll, afterAll } from 'bun:test';
import { hasDbIntegrationDeps, DB_INTEGRATION_ENV_DOCS } from './helpers/integrationEnv.js';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from './helpers/testHelpers.js';
import { ensureTestServer } from './helpers/testServer.js';

beforeAll(async () => {
  if (!hasDbIntegrationDeps()) {
    console.info(`tests/setup.ts: skipping DB hooks (${DB_INTEGRATION_ENV_DOCS})`);
    return;
  }
  await ensureTestServer();
  await connectTestDatabase();
  await clearTestDatabase({ waitForHttp: false });
});

afterAll(async () => {
  if (!hasDbIntegrationDeps()) {
    return;
  }
  await clearTestDatabase({ waitForHttp: false });
  await disconnectTestDatabase();
});
