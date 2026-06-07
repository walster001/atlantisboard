import mongoose from 'mongoose';
import type { Express } from 'express';
import { User } from '../../src/server/models/User.js';
import { initializeAdminConfig } from '../../src/server/models/AdminConfig.js';
import { createMockUser } from './mockData.js';
import {
  apiInject,
  resetIntegrationHttpSession,
  type ApiInjectOptions,
  type ApiInjectResponse,
} from './integrationHttp.js';
import { ensureTestServer } from './testServer.js';
import { DB_INTEGRATION_ENV_DOCS, assertSafeTestMongoUriForDestructiveOps, DEV_MONGO_DATABASE_NAME, isCiTestRun, resolveTestMongoUri } from './integrationEnv.js';

export interface TestUser {
  _id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash?: string;
}

export interface TestAuthToken {
  token: string;
  user: TestUser;
}

const TEST_MONGO_CONNECT_OPTIONS: mongoose.ConnectOptions = {
  serverSelectionTimeoutMS: isCiTestRun() ? 15_000 : 8_000,
  connectTimeoutMS: isCiTestRun() ? 15_000 : 8_000,
  socketTimeoutMS: 30_000,
};

export async function connectTestDatabase(): Promise<void> {
  const uri = resolveTestMongoUri();
  if (!uri) {
    throw new Error(`MONGODB_TEST_URI is not set. ${DB_INTEGRATION_ENV_DOCS}`);
  }
  if (mongoose.connection.readyState === 1) {
    return;
  }
  await mongoose.connect(uri, TEST_MONGO_CONNECT_OPTIONS);
}

export async function disconnectTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  await mongoose.disconnect();
}

export async function clearTestDatabase(options?: { waitForHttp?: boolean }): Promise<void> {
  assertSafeTestMongoUriForDestructiveOps();
  if (options?.waitForHttp === true) {
    await ensureTestServer();
  }
  const { readyState, collections, db } = mongoose.connection;
  if (readyState !== 1) {
    return;
  }
  const databaseName = db?.databaseName;
  if (!isCiTestRun() && databaseName === DEV_MONGO_DATABASE_NAME) {
    throw new Error(
      `Refusing to clear MongoDB: connected to dev database "${DEV_MONGO_DATABASE_NAME}". ` +
        'Tests must use MONGODB_TEST_URI (e.g. kanboard_test).',
    );
  }
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }

  await initializeAdminConfig();
}

export async function getAuthToken(
  email: string = 'test@example.com',
  password: string = 'TestPassword123!',
): Promise<TestAuthToken> {
  resetIntegrationHttpSession();
  await ensureTestServer();

  let user = await User.findOne({ email });
  if (!user) {
    await createMockUser({
      email,
      password,
      username: email.split('@')[0] ?? 'testuser',
      displayName: 'Test User',
    });
    user = await User.findOne({ email });
  }
  if (user === null) {
    throw new Error(`Failed to create or load test user for ${email}`);
  }

  const userId = user._id.toString();
  const { generateToken } = await import('../../src/server/utils/jwt.js');
  const token = generateToken({
    userId,
    email: user.email,
    username: user.username,
    isAppAdmin: user.isAppAdmin,
  });

  return {
    token,
    user: {
      _id: userId,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
    },
  };
}

export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/** Fastify-style inject for integration tests (HTTP to the running server). */
export async function injectApp(options: ApiInjectOptions): Promise<ApiInjectResponse> {
  return apiInject(options);
}

export async function makeAuthenticatedRequest(
  _app: Express,
  method: string,
  url: string,
  token: string,
  payload?: unknown,
): Promise<{ statusCode: number; body: unknown }> {
  const response = await apiInject({
    method,
    url,
    payload,
    headers: createAuthHeaders(token),
  });

  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.body) as unknown,
  };
}
