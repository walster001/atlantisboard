import { describe, it, expect } from 'bun:test';
import type { CardDB } from '../src/client/store/database.js';
import {
  buildKanbanListDisplayRows,
  kanbanListDisplayRowKey,
  KANBAN_DROP_SLOT_ROW_KEY,
} from '../src/client/components/board/kanbanListDisplayRows.js';
import type { CardDropIndicatorTarget } from '../src/client/components/board/VirtualizedCardList/helpers.js';

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

function dropTarget(
  listId: string,
  anchorCardId: string | null,
  columnIntent: CardDropIndicatorTarget['columnIntent'],
): CardDropIndicatorTarget {
  return {
    listId,
    sourceListId: listId,
    anchorCardId,
    columnIntent,
    boxWidth: 248,
    boxHeight: 88,
  };
}

describe('buildKanbanListDisplayRows', () => {
  it('inserts a drop-slot row at the resolved index and hides the dragging card', () => {
    const cards = [card('b', 'l1', 1, 1000), card('a', 'l1', 0, 3000), card('drag', 'l1', 2, 2000)];
    const rows = buildKanbanListDisplayRows(
      cards,
      'l1',
      'drag',
      dropTarget('l1', 'a', 'below'),
    );
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : KANBAN_DROP_SLOT_ROW_KEY))).toEqual([
      'b',
      'a',
      KANBAN_DROP_SLOT_ROW_KEY,
    ]);
    expect(rows.some((row) => row.kind === 'drop-slot')).toBe(true);
  });

  it('places drop-slot first for empty-column intent', () => {
    const rows = buildKanbanListDisplayRows(
      [card('drag', 'l1', 0, 1000)],
      'l1',
      'drag',
      dropTarget('l1', null, 'empty-column'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('drop-slot');
  });

  it('returns only cards when not dragging', () => {
    const cards = [card('b', 'l1', 1, 1000), card('a', 'l1', 0, 3000)];
    const rows = buildKanbanListDisplayRows(cards, 'l1', null, null);
    expect(rows.every((row) => row.kind === 'card')).toBe(true);
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : ''))).toEqual(['b', 'a']);
  });

  it('uses stable keys for cards and a single slot key', () => {
    const cards = [card('a', 'l1', 0, 1000)];
    const rows = buildKanbanListDisplayRows(cards, 'l1', 'drag', dropTarget('l1', 'a', 'below'));
    expect(kanbanListDisplayRowKey(rows[0]!)).toBe('a');
    expect(kanbanListDisplayRowKey(rows[1]!)).toBe(KANBAN_DROP_SLOT_ROW_KEY);
  });
});
