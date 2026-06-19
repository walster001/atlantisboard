import { describe, it, expect } from 'bun:test';
import type { CardDB, ListDB } from '../src/client/store/database.js';
import { CARD_POS_STEP } from '../src/shared/utils/cardListPos.js';
import {
  moveCardBetweenListsInMap,
  moveListToHoverSlot,
  withRenumberedPositions,
  insertIndexAgainstAnchor,
} from '../src/client/store/kanbanDragPure.js';

function card(id: string, listId: string, position: number, pos?: number): CardDB {
  const t = new Date();
  return {
    id,
    listId,
    boardId: 'b1',
    title: id,
    position,
    ...(pos !== undefined ? { pos } : {}),
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

function L(id: string, position: number, pos: number): ListDB {
  const t = new Date();
  return {
    id,
    boardId: 'b1',
    name: id,
    position,
    pos,
    createdAt: t,
    updatedAt: t,
  };
}

describe('withRenumberedPositions', () => {
  it('sets position index and fractional pos for every card', () => {
    const list = [card('a', 'l1', 5), card('b', 'l1', 2)];
    const next = withRenumberedPositions(list);
    expect(next.map((c) => c.position)).toEqual([0, 1]);
    expect(next.map((c) => c.pos)).toEqual([CARD_POS_STEP, 2 * CARD_POS_STEP]);
  });
});

describe('moveCardBetweenListsInMap', () => {
  it('reorders within the same list and sets pos only on the moved card', () => {
    const map = new Map<string, CardDB[]>([
      ['l1', [card('a', 'l1', 0, 1000), card('b', 'l1', 1, 2000), card('c', 'l1', 2, 3000)]],
    ]);
    const next = moveCardBetweenListsInMap(map, 'a', 'l1', 'l1', 2);
    expect(next.get('l1')!.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(next.get('l1')!.find((c) => c.id === 'a')!.pos).toBe(4000);
    expect(next.get('l1')!.find((c) => c.id === 'b')!.pos).toBe(2000);
  });

  it('moves across lists and renumbers both lists with pos', () => {
    const map = new Map<string, CardDB[]>([
      ['l1', [card('a', 'l1', 0, 1000), card('b', 'l1', 1, 2000)]],
      ['l2', [card('c', 'l2', 0, 1000)]],
    ]);
    const next = moveCardBetweenListsInMap(map, 'a', 'l1', 'l2', 1);
    expect(next.get('l1')!.map((c) => c.id)).toEqual(['b']);
    expect(next.get('l2')!.map((c) => c.id)).toEqual(['c', 'a']);
    expect(next.get('l2')!.find((c) => c.id === 'a')!.listId).toBe('l2');
    for (const rows of next.values()) {
      for (const row of rows) {
        expect(typeof row.pos).toBe('number');
      }
    }
    expect(map.get('l1')).toHaveLength(2);
  });

  it('returns prev unchanged when card is missing', () => {
    const map = new Map<string, CardDB[]>([['l1', [card('a', 'l1', 0)]]]);
    const next = moveCardBetweenListsInMap(map, 'missing', 'l1', 'l1', 0);
    expect(next).toBe(map);
  });
});

describe('moveListToHoverSlot', () => {
  it('only assigns a new fractional pos to the moved list; others keep pos', () => {
    const lists = [L('a', 0, 1000), L('b', 1, 2000), L('c', 2, 3000)];
    const next = moveListToHoverSlot(lists, 'c', 'a');
    expect(next).not.toBeNull();
    expect(next!.map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(next![1]!.pos).toBe(1000);
    expect(next![2]!.pos).toBe(2000);
    expect(next![0]!.pos).toBeLessThan(1000);
    expect(next![0]!.pos).toBeGreaterThan(0);
  });
});

describe('insertIndexAgainstAnchor', () => {
  it('uses store card order when integer position diverges from fractional pos', () => {
    // Stale API `position` says a before b; canonical `pos` says b before a (cardIdsByListId order).
    const storeOrder = [card('b', 'l1', 1, 1000), card('a', 'l1', 0, 3000)];
    expect(insertIndexAgainstAnchor(storeOrder, 'a', 'below')).toBe(2);
    expect(insertIndexAgainstAnchor(storeOrder, 'b', 'above')).toBe(0);
  });
});
