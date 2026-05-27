import mongoose from 'mongoose';
import type { Express } from 'express';
import { User } from '../../src/server/models/User.js';
import { initializeAdminConfig } from '../../src/server/models/AdminConfig.js';
import { generateToken } from '../../src/server/utils/jwt.js';
import { createMockUser } from './mockData.js';
import {
  apiInject,
  resetIntegrationHttpSession,
  waitForServer,
  type ApiInjectOptions,
  type ApiInjectResponse,
} from './integrationHttp.js';

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

export async function clearTestDatabase(): Promise<void> {
  await waitForServer();
  const { readyState, collections } = mongoose.connection;
  if (readyState !== 1) {
    return;
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
  await waitForServer();

  let user = await User.findOne({ email });
  if (!user) {
    user = await createMockUser({
      email,
      password,
      username: email.split('@')[0] ?? 'testuser',
      displayName: 'Test User',
    });
  }

  const token = generateToken({
    userId: user._id.toString(),
    email: user.email,
    username: user.username,
    isAppAdmin: user.isAppAdmin,
  });

  return {
    token,
    user: {
      _id: user._id.toString(),
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
