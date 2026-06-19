import { it, expect, beforeEach, beforeAll } from 'bun:test';
import { describeWhenDeps, INTEGRATION_HOOK_TIMEOUT_MS } from '../helpers/integrationEnv.js';
import { getAuthToken, prepareIntegrationTestDatabase } from '../helpers/testHelpers.js';
import { ensureTestServer } from '../helpers/testServer.js';
import { apiInject } from '../helpers/integrationHttp.js';
import { createMockUser, createMockBoardForUser, createMockList } from '../helpers/mockData.js';

describeWhenDeps({ mongo: true, redis: true, mongoTestUriOnly: true }, 'Board-wide list card limits', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  let authToken: string;
  let boardId: string;
  let listId: string;

  beforeEach(async () => {
    await prepareIntegrationTestDatabase();
    const user = await createMockUser();
    const tokenData = await getAuthToken(user.email, 'TestPassword123!');
    authToken = tokenData.token;

    const board = await createMockBoardForUser(user._id);
    boardId = board._id.toString();
    const list = await createMockList(board._id);
    listId = list._id.toString();
  });

  it('should set listMaxCards on board via PUT /boards/:id', async () => {
    const response = await apiInject({
      method: 'PUT',
      url: `/api/v1/boards/${boardId}`,
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      payload: {
        settings: {
          listMaxCards: 50,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { board: { settings: { listMaxCards: number } } };
    expect(body.board.settings.listMaxCards).toBe(50);
  });

  it('should set listEnforceMaxCards on board', async () => {
    const response = await apiInject({
      method: 'PUT',
      url: `/api/v1/boards/${boardId}`,
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      payload: {
        settings: {
          listMaxCards: 10,
          listEnforceMaxCards: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      board: { settings: { listMaxCards: number; listEnforceMaxCards: boolean } };
    };
    expect(body.board.settings.listMaxCards).toBe(10);
    expect(body.board.settings.listEnforceMaxCards).toBe(true);
  });

  it('should reject PUT /lists/:id/settings (removed route)', async () => {
    const response = await apiInject({
      method: 'PUT',
      url: `/api/v1/lists/${listId}/settings`,
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      payload: {
        maxCards: 5,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
