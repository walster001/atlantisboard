import { afterAll, beforeAll, expect, it } from 'bun:test';
import mongoose from 'mongoose';
import { hasWorkspacePermission } from '../src/server/utils/permissions.js';
import { connectTestDatabase, clearTestDatabase } from './helpers/testHelpers.js';
import { createMockUser, createMockWorkspace } from './helpers/mockData.js';
import { describeMongoTest } from './helpers/integrationEnv.js';
import { ensureTestServer } from './helpers/testServer.js';

describeMongoTest('hasWorkspacePermission: workspaces.delete owner-only', () => {
  beforeAll(async () => {
    await ensureTestServer();
    if (mongoose.connection.readyState !== 1) {
      await connectTestDatabase();
    }
    await clearTestDatabase({ waitForHttp: false });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await clearTestDatabase({ waitForHttp: false });
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
