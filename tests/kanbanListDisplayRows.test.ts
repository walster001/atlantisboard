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
  it('keeps dragging card visible until a drop slot is active', () => {
    const cards = [card('a', 'l1', 0, 3000), card('drag', 'l1', 1, 2000), card('b', 'l1', 2, 1000)];
    const rows = buildKanbanListDisplayRows(cards, 'l1', 'drag', null);
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : ''))).toEqual(['b', 'drag', 'a']);
  });

  it('collapses dragging card on source list when drop slot targets another list', () => {
    const sourceCards = [card('a', 'l1', 0, 3000), card('drag', 'l1', 1, 2000)];
    const rows = buildKanbanListDisplayRows(
      sourceCards,
      'l1',
      'drag',
      {
        listId: 'l2',
        sourceListId: 'l1',
        anchorCardId: 'x',
        columnIntent: 'below',
        boxWidth: 248,
        boxHeight: 88,
      },
    );
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : ''))).toEqual(['drag', 'a']);
    expect(rows.find((row) => row.kind === 'card' && row.card.id === 'drag')?.dragLayoutCollapsed).toBe(true);
  });

  it('collapses drag card and inserts separate slot when hover index differs', () => {
    const cards = [card('b', 'l1', 1, 1000), card('a', 'l1', 0, 3000), card('drag', 'l1', 2, 2000)];
    const rows = buildKanbanListDisplayRows(
      cards,
      'l1',
      'drag',
      dropTarget('l1', 'a', 'below'),
    );
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : KANBAN_DROP_SLOT_ROW_KEY))).toEqual([
      'b',
      'drag',
      'a',
      KANBAN_DROP_SLOT_ROW_KEY,
    ]);
    const dragRow = rows[1];
    expect(dragRow?.kind).toBe('card');
    if (dragRow?.kind === 'card') {
      expect(dragRow.dragLayoutCollapsed).toBe(true);
      expect(dragRow.pairedDropSlot).toBeUndefined();
    }
  });

  it('pairs drop-slot with collapsed drag card at the same index', () => {
    const cards = [card('b', 'l1', 1, 1000), card('a', 'l1', 0, 3000), card('drag', 'l1', 2, 2000)];
    const rows = buildKanbanListDisplayRows(
      cards,
      'l1',
      'drag',
      dropTarget('l1', 'b', 'below'),
    );
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : KANBAN_DROP_SLOT_ROW_KEY))).toEqual([
      'b',
      'drag',
      'a',
    ]);
    const dragRow = rows[1];
    expect(dragRow?.kind).toBe('card');
    if (dragRow?.kind === 'card') {
      expect(dragRow.dragLayoutCollapsed).toBe(true);
      expect(dragRow.pairedDropSlot).toBeDefined();
    }
  });

  it('places drop-slot first for empty-column intent', () => {
    const rows = buildKanbanListDisplayRows(
      [card('drag', 'l1', 0, 1000)],
      'l1',
      'drag',
      dropTarget('l1', null, 'empty-column'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('card');
    if (rows[0]?.kind === 'card') {
      expect(rows[0].pairedDropSlot?.columnIntent).toBe('empty-column');
    }
  });

  it('inserts drop-slot on target list when draggingCardId is scoped null', () => {
    const targetCards = [card('x', 'l2', 0, 1000), card('y', 'l2', 1, 2000)];
    const rows = buildKanbanListDisplayRows(
      targetCards,
      'l2',
      null,
      dropTarget('l2', 'x', 'below'),
    );
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : KANBAN_DROP_SLOT_ROW_KEY))).toEqual([
      'x',
      KANBAN_DROP_SLOT_ROW_KEY,
      'y',
    ]);
  });

  it('returns only cards in pos order when not dragging', () => {
    const cards = [card('a', 'l1', 0, 3000), card('b', 'l1', 1, 1000)];
    const rows = buildKanbanListDisplayRows(cards, 'l1', null, null);
    expect(rows.every((row) => row.kind === 'card')).toBe(true);
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : ''))).toEqual(['b', 'a']);
  });

  it('shows drop-slot on a target list while dragging from another list', () => {
    const targetCards = [card('a', 'l2', 0, 3000), card('b', 'l2', 1, 1000)];
    const rows = buildKanbanListDisplayRows(
      targetCards,
      'l2',
      'drag-from-l1',
      dropTarget('l2', 'a', 'below'),
    );
    expect(rows.some((row) => row.kind === 'drop-slot')).toBe(true);
    expect(rows.map((row) => (row.kind === 'card' ? row.card.id : KANBAN_DROP_SLOT_ROW_KEY))).toEqual([
      'b',
      'a',
      KANBAN_DROP_SLOT_ROW_KEY,
    ]);
  });

  it('uses stable keys for cards and a slot key from anchor intent', () => {
    const cards = [card('a', 'l1', 0, 1000), card('drag', 'l1', 1, 2000)];
    const rows = buildKanbanListDisplayRows(cards, 'l1', 'drag', dropTarget('l1', 'a', 'below'));
    expect(kanbanListDisplayRowKey(rows[0]!)).toBe('a');
    expect(kanbanListDisplayRowKey(rows[1]!)).toBe('drag');
  });
});
