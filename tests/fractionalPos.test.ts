/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { createFractionalPos } from '../src/shared/utils/fractionalPos.js';
import {
  CARD_POS_STEP,
  compareCardListOrder,
  insertPosBetween,
  spreadPosForIndex,
} from '../src/shared/utils/cardListPos.js';
import {
  LIST_POS_STEP,
  compareBoardListOrder,
  insertListPosBetween,
  spreadListPosForIndex,
} from '../src/shared/utils/listPos.js';

describe('fractionalPos factory', () => {
  const pos = createFractionalPos(1000, 1e-6);

  it('matches list and card thin exports', () => {
    expect(LIST_POS_STEP).toBe(1000);
    expect(CARD_POS_STEP).toBe(1000);
    expect(spreadListPosForIndex(2)).toBe(pos.spreadForIndex(2));
    expect(spreadPosForIndex(2)).toBe(pos.spreadForIndex(2));
    expect(insertListPosBetween(1000, 3000)).toBe(pos.insertBetween(1000, 3000));
    expect(insertPosBetween(1000, 3000)).toBe(pos.insertBetween(1000, 3000));
  });

  it('orders rows by pos then id', () => {
    const ordered = [
      { id: 'b', position: 1, pos: 2000 },
      { id: 'a', position: 0, pos: 1000 },
      { id: 'c', position: 2, pos: 3000 },
    ].sort((a, b) => compareBoardListOrder(a, b));
    expect(ordered.map((row) => row.id)).toEqual(['a', 'b', 'c']);

    const cards = [
      { id: 'y', position: 1, pos: 2000 },
      { id: 'x', position: 0, pos: 1000 },
    ].sort((a, b) => compareCardListOrder(a, b));
    expect(cards.map((row) => row.id)).toEqual(['x', 'y']);
  });

  it('falls back to legacy integer position when pos is missing', () => {
    expect(compareBoardListOrder({ id: 'a', position: 0 }, { id: 'b', position: 1 })).toBeLessThan(0);
    expect(compareCardListOrder({ id: 'a', position: 0 }, { id: 'b', position: 1 })).toBeLessThan(0);
  });
});
