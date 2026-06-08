import { expect, it } from 'bun:test';
import { describeHttpIntegration } from './helpers/integrationEnv.js';
import { beforeAllEnsureTestServer } from './helpers/integrationHooks.js';
import { apiInject } from './helpers/integrationHttp.js';
import {
  createAuthHeaders,
  createHttpIntegrationAuthUser,
  readApiEntityId,
} from './helpers/testHelpers.js';

describeHttpIntegration('Board card descriptions batch', () => {
  beforeAllEnsureTestServer();

  it('returns description fields for board members via GET without CSRF', async () => {
    const nonce = Date.now();
    const owner = await createHttpIntegrationAuthUser({
      email: `desc-owner-${nonce}@example.com`,
      username: `desc-owner-${nonce}`,
      canCreateWorkspace: true,
    });
    const outsider = await createHttpIntegrationAuthUser({
      email: `desc-outsider-${nonce}@example.com`,
      username: `desc-outsider-${nonce}`,
    });

    const wsRes = await apiInject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: createAuthHeaders(owner.token),
      payload: { name: `WS ${nonce}` },
    });
    expect(wsRes.statusCode).toBe(201);
    const workspaceId = readApiEntityId(
      (JSON.parse(wsRes.body) as { workspace: { id?: string; _id?: string } }).workspace,
    );

    const boardRes = await apiInject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: createAuthHeaders(owner.token),
      payload: { workspaceId, name: `Board ${nonce}` },
    });
    expect(boardRes.statusCode).toBe(201);
    const boardId = readApiEntityId(
      (JSON.parse(boardRes.body) as { board: { id?: string; _id?: string } }).board,
    );

    const listRes = await apiInject({
      method: 'POST',
      url: '/api/v1/lists',
      headers: createAuthHeaders(owner.token),
      payload: { boardId, name: `List ${nonce}` },
    });
    expect(listRes.statusCode).toBe(201);
    const listId = readApiEntityId(
      (JSON.parse(listRes.body) as { list: { id?: string; _id?: string } }).list,
    );

    const cardRes = await apiInject({
      method: 'POST',
      url: '/api/v1/cards',
      headers: createAuthHeaders(owner.token),
      payload: {
        boardId,
        listId,
        title: `Card ${nonce}`,
      },
    });
    expect(cardRes.statusCode).toBe(201);
    const cardId = readApiEntityId(
      (JSON.parse(cardRes.body) as { card: { id?: string; _id?: string } }).card,
    );

    const batchRes = await apiInject({
      method: 'GET',
      url: `/api/v1/boards/${boardId}/cards/descriptions-batch?cardIds=${cardId}`,
      headers: createAuthHeaders(owner.token),
    });
    expect(batchRes.statusCode).toBe(200);
    const batchBody = JSON.parse(batchRes.body) as {
      cards?: Array<{ id: string; description: string }>;
    };
    expect(batchBody.cards).toEqual([{ id: cardId, description: '' }]);

    const deniedRes = await apiInject({
      method: 'GET',
      url: `/api/v1/boards/${boardId}/cards/descriptions-batch?cardIds=${cardId}`,
      headers: createAuthHeaders(outsider.token),
    });
    expect(deniedRes.statusCode).toBe(403);
    const deniedBody = JSON.parse(deniedRes.body) as { error?: { code?: string } };
    expect(deniedBody.error?.code).toBe('FORBIDDEN');
  });
});
