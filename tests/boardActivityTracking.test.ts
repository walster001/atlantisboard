/// <reference types="bun-types" />
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import * as activityService from '../src/server/services/activityService.js';
import { recordBoardActivity } from '../src/server/services/boardActivityTracking.js';

describe('recordBoardActivity', () => {
  afterEach(() => {
    spyOn(activityService, 'createActivity').mockRestore();
  });

  it('does not write when activity log is disabled', async () => {
    const createSpy = spyOn(activityService, 'createActivity').mockImplementation(() => undefined);

    await recordBoardActivity({
      boardId: 'board-1',
      userId: 'user-1',
      category: 'cards',
      type: 'card.created',
      description: 'Card created',
      boardSettings: { activityLogEnabled: false, activityLogTracking: { cards: true } },
    });

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('does not write when the category toggle is off', async () => {
    const createSpy = spyOn(activityService, 'createActivity').mockImplementation(() => undefined);

    await recordBoardActivity({
      boardId: 'board-1',
      userId: 'user-1',
      category: 'cards',
      type: 'card.created',
      description: 'Card created',
      boardSettings: { activityLogEnabled: true, activityLogTracking: { cards: false } },
    });

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('writes when enabled and category is on', async () => {
    const createSpy = spyOn(activityService, 'createActivity').mockImplementation(() => undefined);

    await recordBoardActivity({
      boardId: 'board-1',
      userId: 'user-1',
      category: 'cards',
      type: 'card.moved',
      description: 'Card moved',
      cardId: 'card-1',
      metadata: { listName: 'Done' },
      boardSettings: { activityLogEnabled: true, activityLogTracking: { cards: true } },
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0]?.[0]).toEqual({
      boardId: 'board-1',
      userId: 'user-1',
      type: 'card.moved',
      description: 'Card moved',
      cardId: 'card-1',
      metadata: { listName: 'Done' },
    });
  });

  it('uses default category tracking when board tracking is unset', async () => {
    const createSpy = spyOn(activityService, 'createActivity').mockImplementation(() => undefined);

    await recordBoardActivity({
      boardId: 'board-1',
      userId: 'user-1',
      category: 'comments',
      type: 'comment.created',
      description: 'Comment added',
      boardSettings: { activityLogEnabled: true },
    });

    expect(createSpy).not.toHaveBeenCalled();
  });
});
