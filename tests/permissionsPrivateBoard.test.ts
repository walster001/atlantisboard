import { expect, it, beforeAll } from 'bun:test';
import { describeWhenDeps, INTEGRATION_HOOK_TIMEOUT_MS } from './helpers/integrationEnv.js';
import { ensureTestServer } from './helpers/testServer.js';
import { apiInject } from './helpers/integrationHttp.js';
import {
  createAuthHeaders,
  createHttpIntegrationAuthUser,
  readApiEntityId,
} from './helpers/testHelpers.js';

describeWhenDeps({ mongo: true, redis: true }, 'Permissions: private board isolation', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('denies non-members from reading lists/cards/labels and modifying card labels', async () => {
    const nonce = Date.now();
    const u1 = await createHttpIntegrationAuthUser({
      email: `p1-${nonce}@example.com`,
      username: `p1-${nonce}`,
      canCreateWorkspace: true,
    });
    const u2 = await createHttpIntegrationAuthUser({
      email: `p2-${nonce}@example.com`,
      username: `p2-${nonce}`,
    });

    const wsRes = await apiInject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: createAuthHeaders(u1.token),
      payload: { name: `WS ${nonce}` },
    });
    expect(wsRes.statusCode).toBe(201);
    const ws = JSON.parse(wsRes.body) as { workspace: { id?: string; _id?: string } };
    const workspaceId = readApiEntityId(ws.workspace);

    const bRes = await apiInject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: createAuthHeaders(u1.token),
      payload: { workspaceId, name: `B ${nonce}` },
    });
    expect(bRes.statusCode).toBe(201);
    const board = JSON.parse(bRes.body) as { board: { id?: string; _id?: string } };
    const boardId = readApiEntityId(board.board);

    const lRes = await apiInject({
      method: 'POST',
      url: '/api/v1/lists',
      headers: createAuthHeaders(u1.token),
      payload: { boardId, name: `L ${nonce}` },
    });
    expect(lRes.statusCode).toBe(201);
    const list = JSON.parse(lRes.body) as { list: { id?: string; _id?: string } };
    const listId = readApiEntityId(list.list);

    const cRes = await apiInject({
      method: 'POST',
      url: '/api/v1/cards',
      headers: createAuthHeaders(u1.token),
      payload: { boardId, listId, title: `C ${nonce}` },
    });
    expect(cRes.statusCode).toBe(201);
    const card = JSON.parse(cRes.body) as { card: { id?: string; _id?: string } };
    const cardId = readApiEntityId(card.card);

    const labelRes = await apiInject({
      method: 'POST',
      url: `/api/v1/boards/${boardId}/labels`,
      headers: createAuthHeaders(u1.token),
      payload: { name: `Label ${nonce}`, color: '#61BD4F' },
    });
    expect(labelRes.statusCode).toBe(201);
    const label = JSON.parse(labelRes.body) as { label: { _id: string } };

    const lists = await apiInject({
      method: 'GET',
      url: `/api/v1/lists/board/${boardId}`,
      headers: createAuthHeaders(u2.token),
    });
    expect(lists.statusCode).toBe(403);

    const cards = await apiInject({
      method: 'GET',
      url: `/api/v1/cards/list/${listId}`,
      headers: createAuthHeaders(u2.token),
    });
    expect(cards.statusCode).toBe(403);

    const labels = await apiInject({
      method: 'GET',
      url: `/api/v1/boards/${boardId}/labels`,
      headers: createAuthHeaders(u2.token),
    });
    expect(labels.statusCode).toBe(403);

    const assign = await apiInject({
      method: 'POST',
      url: `/api/v1/cards/${cardId}/labels/${label.label._id}`,
      headers: createAuthHeaders(u2.token),
    });
    expect(assign.statusCode).toBe(403);
  });

  it('board-only workspace member does not receive other boards in the same workspace from GET /boards', async () => {
    const nonce = Date.now();
    const owner = await createHttpIntegrationAuthUser({
      email: `bo-${nonce}-o@example.com`,
      username: `bo-${nonce}-o`,
      canCreateWorkspace: true,
    });
    const guest = await createHttpIntegrationAuthUser({
      email: `bo-${nonce}-g@example.com`,
      username: `bo-${nonce}-g`,
    });

    const wsRes = await apiInject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: createAuthHeaders(owner.token),
      payload: { name: `WS-BO ${nonce}` },
    });
    expect(wsRes.statusCode).toBe(201);
    const ws = JSON.parse(wsRes.body) as { workspace: { id?: string; _id?: string } };
    const workspaceId = readApiEntityId(ws.workspace);

    const b1Res = await apiInject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: createAuthHeaders(owner.token),
      payload: { workspaceId, name: `Shared ${nonce}` },
    });
    expect(b1Res.statusCode).toBe(201);
    const b1 = JSON.parse(b1Res.body) as { board: { id?: string; _id?: string } };
    const b1Id = readApiEntityId(b1.board);

    const b2Res = await apiInject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: createAuthHeaders(owner.token),
      payload: { workspaceId, name: `Secret ${nonce}` },
    });
    expect(b2Res.statusCode).toBe(201);
    const b2 = JSON.parse(b2Res.body) as { board: { id?: string; _id?: string } };
    const b2Id = readApiEntityId(b2.board);

    const addRes = await apiInject({
      method: 'POST',
      url: `/api/v1/boards/${b1Id}/members`,
      headers: createAuthHeaders(owner.token),
      payload: { userId: guest.userId, roleKey: 'viewer' },
    });
    expect(addRes.statusCode).toBe(200);

    const listAll = await apiInject({
      method: 'GET',
      url: '/api/v1/boards',
      headers: createAuthHeaders(guest.token),
    });
    expect(listAll.statusCode).toBe(200);
    const allBody = JSON.parse(listAll.body) as { boards?: Array<{ id?: string; _id?: string }> };
    const ids = (allBody.boards ?? []).map((b) => readApiEntityId(b));
    expect(ids).toContain(b1Id);
    expect(ids).not.toContain(b2Id);

    const listWs = await apiInject({
      method: 'GET',
      url: `/api/v1/boards?workspaceId=${workspaceId}`,
      headers: createAuthHeaders(guest.token),
    });
    expect(listWs.statusCode).toBe(200);
    const wsBody = JSON.parse(listWs.body) as { boards?: Array<{ id?: string; _id?: string }> };
    const wsIds = (wsBody.boards ?? []).map((b) => readApiEntityId(b));
    expect(wsIds).toEqual([b1Id]);

    const wsList = await apiInject({
      method: 'GET',
      url: '/api/v1/workspaces?view=summary',
      headers: createAuthHeaders(guest.token),
    });
    expect(wsList.statusCode).toBe(200);
    const wsListBody = JSON.parse(wsList.body) as {
      workspaces?: Array<{ id?: string; _id?: string; boardScopedHomeOnly?: boolean; members?: unknown }>;
    };
    const wsListIds = (wsListBody.workspaces ?? []).map((w) => readApiEntityId(w));
    expect(wsListIds).toContain(workspaceId);
    const guestWs = (wsListBody.workspaces ?? []).find((w) => readApiEntityId(w) === workspaceId);
    expect(guestWs?.boardScopedHomeOnly).toBe(true);
    expect(guestWs?.members).toBeUndefined();
  });
});
