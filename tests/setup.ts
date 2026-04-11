import { beforeAll, afterAll } from 'bun:test';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from './helpers/testHelpers.js';

beforeAll(async () => {
  await connectTestDatabase();
  await clearTestDatabase();
});

afterAll(async () => {
  await clearTestDatabase();
  await disconnectTestDatabase();
});


