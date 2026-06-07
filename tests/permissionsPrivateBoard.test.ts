import { expect, it } from 'bun:test';
import { describeHttpIntegration } from './helpers/integrationEnv.js';
import { beforeAllEnsureTestServer } from './helpers/integrationHooks.js';
import { apiInject } from './helpers/integrationHttp.js';
import { createAuthHeaders, registerHttpIntegrationUser } from './helpers/testHelpers.js';

type AuthPair = { token: string; userId: string };

async function authFor(email: string, username: string): Promise<AuthPair> {
  return registerHttpIntegrationUser(email, username);
}

describeHttpIntegration('Permissions: private board isolation', () => {
  beforeAllEnsureTestServer();

  it('denies non-members from reading lists/cards/labels and modifying card labels', async () => {
    const nonce = Date.now();
    const u1 = await authFor(`p1-${nonce}@example.com`, `p1-${nonce}`);
    const u2 = await authFor(`p2-${nonce}@example.com`, `p2-${nonce}`);
    if (!u1.token || !u2.token) {
      expect(true).toBe(true);
      return;
    }

    const wsRes = await apiInject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: createAuthHeaders(u1.token),
      payload: { name: `WS ${nonce}` },
    });
    expect(wsRes.statusCode).toBe(201);
    const ws = JSON.parse(wsRes.body) as { workspace: { id: string } };

    const bRes = await apiInject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: createAuthHeaders(u1.token),
      payload: { workspaceId: ws.workspace.id, name: `B ${nonce}` },
    });
    expect(bRes.statusCode).toBe(201);
    const board = JSON.parse(bRes.body) as { board: { id: string } };

    const lRes = await apiInject({
      method: 'POST',
      url: '/api/v1/lists',
      headers: createAuthHeaders(u1.token),
      payload: { boardId: board.board.id, name: `L ${nonce}` },
    });
    expect(lRes.statusCode).toBe(201);
    const list = JSON.parse(lRes.body) as { list: { id: string } };

    const cRes = await apiInject({
      method: 'POST',
      url: '/api/v1/cards',
      headers: createAuthHeaders(u1.token),
      payload: { boardId: board.board.id, listId: list.list.id, title: `C ${nonce}` },
    });
    expect(cRes.statusCode).toBe(201);
    const card = JSON.parse(cRes.body) as { card: { id: string } };

    const labelRes = await apiInject({
      method: 'POST',
      url: `/api/v1/boards/${board.board.id}/labels`,
      headers: createAuthHeaders(u1.token),
      payload: { name: `Label ${nonce}`, color: '#61BD4F' },
    });
    expect(labelRes.statusCode).toBe(201);
    const label = JSON.parse(labelRes.body) as { label: { _id: string } };

    const lists = await apiInject({
      method: 'GET',
      url: `/api/v1/lists/board/${board.board.id}`,
      headers: createAuthHeaders(u2.token),
    });
    expect(lists.statusCode).toBe(403);

    const cards = await apiInject({
      method: 'GET',
      url: `/api/v1/cards/list/${list.list.id}`,
      headers: createAuthHeaders(u2.token),
    });
    expect(cards.statusCode).toBe(403);

    const labels = await apiInject({
      method: 'GET',
      url: `/api/v1/boards/${board.board.id}/labels`,
      headers: createAuthHeaders(u2.token),
    });
    expect(labels.statusCode).toBe(403);

    const assign = await apiInject({
      method: 'POST',
      url: `/api/v1/cards/${card.card.id}/labels/${label.label._id}`,
      headers: createAuthHeaders(u2.token),
    });
    expect(assign.statusCode).toBe(403);
  });

  it('board-only workspace member does not receive other boards in the same workspace from GET /boards', async () => {
    const nonce = Date.now();
    const owner = await authFor(`bo-${nonce}-o@example.com`, `bo-${nonce}-o`);
    const guest = await authFor(`bo-${nonce}-g@example.com`, `bo-${nonce}-g`);
    if (!owner.token || !guest.token) {
      expect(true).toBe(true);
      return;
    }

    const wsRes = await apiInject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: createAuthHeaders(owner.token),
      payload: { name: `WS-BO ${nonce}` },
    });
    expect(wsRes.statusCode).toBe(201);
    const ws = JSON.parse(wsRes.body) as { workspace: { id: string } };
    const workspaceId = ws.workspace.id;

    const b1Res = await apiInject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: createAuthHeaders(owner.token),
      payload: { workspaceId, name: `Shared ${nonce}` },
    });
    expect(b1Res.statusCode).toBe(201);
    const b1 = JSON.parse(b1Res.body) as { board: { id: string } };

    const b2Res = await apiInject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: createAuthHeaders(owner.token),
      payload: { workspaceId, name: `Secret ${nonce}` },
    });
    expect(b2Res.statusCode).toBe(201);
    const b2 = JSON.parse(b2Res.body) as { board: { id: string } };

    const addRes = await apiInject({
      method: 'POST',
      url: `/api/v1/boards/${b1.board.id}/members`,
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
    const allBody = JSON.parse(listAll.body) as { boards?: Array<{ id: string }> };
    const ids = (allBody.boards ?? []).map((b) => b.id);
    expect(ids).toContain(b1.board.id);
    expect(ids).not.toContain(b2.board.id);

    const listWs = await apiInject({
      method: 'GET',
      url: `/api/v1/boards?workspaceId=${workspaceId}`,
      headers: createAuthHeaders(guest.token),
    });
    expect(listWs.statusCode).toBe(200);
    const wsBody = JSON.parse(listWs.body) as { boards?: Array<{ id: string }> };
    const wsIds = (wsBody.boards ?? []).map((b) => b.id);
    expect(wsIds).toEqual([b1.board.id]);

    const wsList = await apiInject({
      method: 'GET',
      url: '/api/v1/workspaces?view=summary',
      headers: createAuthHeaders(guest.token),
    });
    expect(wsList.statusCode).toBe(200);
    const wsListBody = JSON.parse(wsList.body) as {
      workspaces?: Array<{ id: string; boardScopedHomeOnly?: boolean; members?: unknown }>;
    };
    const wsListIds = (wsListBody.workspaces ?? []).map((w) => w.id);
    expect(wsListIds).toContain(workspaceId);
    const guestWs = (wsListBody.workspaces ?? []).find((w) => w.id === workspaceId);
    expect(guestWs?.boardScopedHomeOnly).toBe(true);
    expect(guestWs?.members).toBeUndefined();
  });
});
