import mongoose from 'mongoose';
import type { Express } from 'express';
import { app } from '../../src/server/index.js';

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

let testDb: typeof mongoose | null = null;

export async function connectTestDatabase(): Promise<void> {
  if (testDb) {
    return;
  }

  const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/kanboard-test';
  testDb = await mongoose.connect(testDbUri);
}

export async function disconnectTestDatabase(): Promise<void> {
  if (testDb) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    testDb = null;
  }
}

export async function clearTestDatabase(): Promise<void> {
  if (testDb) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}

export async function getAuthToken(
  email: string = 'test@example.com',
  password: string = 'TestPassword123!'
): Promise<TestAuthToken> {
  // Register user if doesn't exist
  try {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        username: email.split('@')[0],
        password,
        displayName: 'Test User',
      },
    });
  } catch (err) {
    // User might already exist, try login
  }

  // Login to get token
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email,
      password,
    },
  });

  if (loginResponse.statusCode !== 200) {
    throw new Error('Failed to authenticate test user');
  }

  const body = JSON.parse(loginResponse.body);
  return {
    token: body.token,
    user: body.user,
  };
}

export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function makeAuthenticatedRequest(
  app: Express,
  method: string,
  url: string,
  token: string,
  payload?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  const response = await app.inject({
    method,
    url,
    payload,
    headers: createAuthHeaders(token),
  });

  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.body),
  };
}

