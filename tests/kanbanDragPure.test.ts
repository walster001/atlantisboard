import { describe, it, expect } from 'bun:test';
import type { ListDB } from '../src/client/store/database.js';
import { moveListToHoverSlot } from '../src/client/store/kanbanDragPure.js';

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
