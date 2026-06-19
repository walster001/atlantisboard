import { describe, it, expect } from 'bun:test';
import type { CardDB } from '../src/client/store/database.js';
import { kanbanInsertIndexForDrop, resolveCardDropForCommit } from '../src/client/components/board/kanbanPragmaticDndHelpers.js';

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
  it('indexes anchors in cardIdsByListId order', () => {
    const listCards = [card('b', 'l1', 1, 1000), card('a', 'l1', 0, 3000)];
    expect(
      kanbanInsertIndexForDrop(listCards, 'drag', {
        anchorCardId: 'a',
        columnIntent: 'below',
      }),
    ).toBe(2);
  });

  it('sorts by fractional pos when array order diverges from canonical order', () => {
    const listCards = [card('a', 'l1', 0, 3000), card('b', 'l1', 1, 1000)];
    expect(
      kanbanInsertIndexForDrop(listCards, 'drag', {
        anchorCardId: 'b',
        columnIntent: 'above',
      }),
    ).toBe(0);
  });
});

describe('resolveCardDropForCommit', () => {
  it('prefers the last hover indicator over drop-time hit testing', () => {
    const lastIndicator = {
      listId: 'l2',
      sourceListId: 'l1',
      anchorCardId: 'c2',
      columnIntent: 'above' as const,
      boxWidth: 248,
      boxHeight: 88,
    };
    const resolved = resolveCardDropForCommit(
      lastIndicator,
      { listId: 'l2', anchorCardId: 'c9', columnIntent: 'append-end' },
      { listId: 'l1', anchorCardId: null, columnIntent: 'empty-column' },
    );
    expect(resolved).toEqual({
      listId: 'l2',
      anchorCardId: 'c2',
      columnIntent: 'above',
    });
  });

  it('falls back to on-drop resolution then source-list fallback', () => {
    expect(
      resolveCardDropForCommit(
        null,
        { listId: 'l2', anchorCardId: 'c1', columnIntent: 'below' },
        { listId: 'l1', anchorCardId: 'x', columnIntent: 'append-end' },
      ),
    ).toEqual({ listId: 'l2', anchorCardId: 'c1', columnIntent: 'below' });
    expect(
      resolveCardDropForCommit(null, null, {
        listId: 'l1',
        anchorCardId: 'x',
        columnIntent: 'append-end',
      }),
    ).toEqual({ listId: 'l1', anchorCardId: 'x', columnIntent: 'append-end' });
  });
});
