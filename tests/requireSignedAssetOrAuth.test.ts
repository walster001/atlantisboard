import { afterAll, beforeAll, expect, it } from 'bun:test';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import { requireSignedAssetOrAuth } from '../src/server/middleware/auth.js';
import { connectTestDatabase, clearTestDatabase, getAuthToken } from './helpers/testHelpers.js';
import { User } from '../src/server/models/User.js';
import { describeMongoTest } from './helpers/integrationEnv.js';
import { INTEGRATION_HOOK_TIMEOUT_MS } from './helpers/integrationHooks.js';
import { ensureTestServer } from './helpers/testServer.js';

type MockResponse = Response & { statusCode: number; body: unknown };

function createMockResponse(): MockResponse {
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
  return res as MockResponse;
}

describeMongoTest('requireSignedAssetOrAuth', () => {
  beforeAll(async () => {
    await ensureTestServer();
    if (mongoose.connection.readyState !== 1) {
      await connectTestDatabase();
    }
    await clearTestDatabase({ waitForHttp: false });
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await clearTestDatabase({ waitForHttp: false });
    }
  });

  it('returns 403 when the JWT user account is locked', async () => {
    const { token, user } = await getAuthToken(`locked-${Date.now()}@example.com`);
    const lockedUntil = new Date(Date.now() + 60_000);
    await User.updateOne({ _id: user._id }, { $set: { lockedUntil } });
    const lockedUser = await User.findById(user._id);
    expect(lockedUser?.lockedUntil && lockedUser.lockedUntil > new Date()).toBe(true);

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
        Authorization: `Bearer ${token}`,
      },
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
