import { describe, expect, it } from 'bun:test';
import type { CardDB } from '../src/client/store/database.js';
import {
  cardDropIndicatorFromResolved,
  DEFAULT_KANBAN_CARD_DROP_METRICS,
  dropSlotDisplayHeightPx,
  initialCardDropForDraggedCard,
  kanbanCardDragMetricsFromElement,
  kanbanCurrentInsertIndex,
  kanbanInsertIndexForDrop,
} from '../src/client/components/board/kanbanPragmaticDndHelpers.js';

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

describe('kanban card drop helpers', () => {
  it('dropSlotDisplayHeightPx passes through measured card height', () => {
    expect(dropSlotDisplayHeightPx(58)).toBe(58);
    expect(dropSlotDisplayHeightPx(74.4)).toBe(74);
    expect(dropSlotDisplayHeightPx(120)).toBe(120);
    expect(dropSlotDisplayHeightPx(400)).toBe(400);
  });

  it('kanbanCardDragMetricsFromElement falls back when element is missing', () => {
    expect(kanbanCardDragMetricsFromElement(null)).toEqual(DEFAULT_KANBAN_CARD_DROP_METRICS);
  });

  it('cardDropIndicatorFromResolved carries measured drag metrics into boxHeight', () => {
    const resolved = { listId: 'l2', anchorCardId: 'a', columnIntent: 'below' as const };
    const titleOnly = cardDropIndicatorFromResolved(resolved, 'l1', { width: 248, height: 58 });
    const withPreview = cardDropIndicatorFromResolved(resolved, 'l1', { width: 248, height: 120 });
    const withDescIcon = cardDropIndicatorFromResolved(resolved, 'l1', { width: 248, height: 74 });
    expect(dropSlotDisplayHeightPx(titleOnly.boxHeight)).toBe(58);
    expect(dropSlotDisplayHeightPx(withPreview.boxHeight)).toBe(120);
    expect(dropSlotDisplayHeightPx(withDescIcon.boxHeight)).toBe(74);
  });

  it('initialCardDropForDraggedCard preserves middle-card position', () => {
    const cards = new Map<string, readonly CardDB[]>([
      ['l1', [card('a', 'l1', 0, 3000), card('drag', 'l1', 1, 2000), card('b', 'l1', 2, 1000)]],
    ]);
    const initial = initialCardDropForDraggedCard(cards, 'l1', 'drag');
    const insertIndex = kanbanInsertIndexForDrop(cards.get('l1') ?? [], 'drag', initial);
    expect(insertIndex).toBe(kanbanCurrentInsertIndex(cards.get('l1') ?? [], 'drag'));
  });

  it('initialCardDropForDraggedCard preserves first-card position', () => {
    const listCards = [card('drag', 'l1', 0, 1000), card('b', 'l1', 1, 2000)];
    const cards = new Map<string, readonly CardDB[]>([['l1', listCards]]);
    const initial = initialCardDropForDraggedCard(cards, 'l1', 'drag');
    const insertIndex = kanbanInsertIndexForDrop(listCards, 'drag', initial);
    expect(insertIndex).toBe(kanbanCurrentInsertIndex(listCards, 'drag'));
  });
});
