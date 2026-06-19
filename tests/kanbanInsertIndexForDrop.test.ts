import { describe, it, expect } from 'bun:test';
import type { CardDB } from '../src/client/store/database.js';
import { kanbanInsertIndexForDrop } from '../src/client/components/board/kanbanPragmaticDndHelpers.js';

function card(id: string, listId: string, position: number, pos: number): CardDB {
  const t = new Date();
  return {
    id,
    listId,
    boardId: 'b1',
    title: id,
    position,
    pos,
    labels: [],
    completed: false,
    createdBy: 'u1',
    assignees: [],
    reminders: [],
    attachments: [],
    comments: [],
    checklists: [],
    createdAt: t,
    updatedAt: t,
  };
}

describe('kanbanInsertIndexForDrop', () => {
  it('indexes anchors in cardIdsByListId order when integer position diverges from pos', () => {
    const listCards = [card('b', 'l1', 1, 1000), card('a', 'l1', 0, 3000)];
    expect(
      kanbanInsertIndexForDrop(listCards, 'drag', {
        anchorCardId: 'a',
        columnIntent: 'below',
      }),
    ).toBe(2);
  });
});
