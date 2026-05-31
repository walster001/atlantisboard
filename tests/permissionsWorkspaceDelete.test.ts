import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import mongoose from 'mongoose';
import { hasWorkspacePermission } from '../src/server/utils/permissions.js';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from './helpers/testHelpers.js';
import { createMockUser, createMockWorkspace } from './helpers/mockData.js';

const hasTestDb =
  typeof process.env.MONGODB_TEST_URI === 'string' && process.env.MONGODB_TEST_URI.trim() !== '';

describe.skipIf(!hasTestDb)('hasWorkspacePermission: workspaces.delete owner-only', () => {
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

  it('grants workspaces.delete only to the workspace owner', async () => {
    const owner = await createMockUser();
    const adminMember = await createMockUser({
      email: `ws-del-admin-${Date.now()}@example.com`,
      username: `ws-del-admin-${Date.now()}`,
    });
    const workspace = await createMockWorkspace(owner._id);
    workspace.members.push({
      userId: adminMember._id,
      roleKey: 'admin',
      joinedAt: new Date(),
    });
    await workspace.save();

    const workspaceId = workspace._id.toString();
    const ownerId = owner._id.toString();
    const adminMemberId = adminMember._id.toString();

    expect(await hasWorkspacePermission(ownerId, workspaceId, 'workspaces.delete')).toBe(true);
    expect(await hasWorkspacePermission(adminMemberId, workspaceId, 'workspaces.delete')).toBe(false);
  });
});
