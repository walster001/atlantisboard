import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import { requireSignedAssetOrAuth } from '../src/server/middleware/auth.js';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase, getAuthToken } from './helpers/testHelpers.js';
import { User } from '../src/server/models/User.js';

const hasTestDb =
  typeof process.env.MONGODB_TEST_URI === 'string' && process.env.MONGODB_TEST_URI.trim() !== '';

function createMockResponse(): Response & { statusCode: number; body: unknown } {
  const state = { statusCode: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

describe.skipIf(!hasTestDb)('requireSignedAssetOrAuth', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await connectTestDatabase();
    }
    await clearTestDatabase();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await clearTestDatabase();
      await disconnectTestDatabase();
    }
  });

  it('returns 403 when the JWT user account is locked', async () => {
    const { token, user } = await getAuthToken(`locked-${Date.now()}@example.com`);
    await User.findByIdAndUpdate(user._id, {
      lockedUntil: new Date(Date.now() + 60_000),
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      query: {},
    } as unknown as Request;
    const res = createMockResponse();

    const allowed = await requireSignedAssetOrAuth(req, res, '/api/v1/users/avatar/test');
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when the JWT user no longer exists', async () => {
    const { token, user } = await getAuthToken(`missing-${Date.now()}@example.com`);
    await User.findByIdAndDelete(user._id);

    const req = {
      headers: { authorization: `Bearer ${token}` },
      query: {},
    } as unknown as Request;
    const res = createMockResponse();

    const allowed = await requireSignedAssetOrAuth(req, res, '/api/v1/users/avatar/test');
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
