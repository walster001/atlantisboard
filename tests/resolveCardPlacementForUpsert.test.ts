import { describe, expect, it } from 'bun:test';
import { resolveCardPlacementForUpsert } from '../src/client/store/boardRuntime/types.js';
import { spreadPosForIndex } from '../src/shared/utils/cardListPos.js';
import type { CardDB } from '../src/client/store/database.js';

function baseCard(overrides: Partial<CardDB> = {}): CardDB {
  return {
    id: 'c1',
    listId: 'l1',
    boardId: 'b1',
    title: 'Card',
    position: 0,
    labels: [],
    completed: false,
    createdBy: 'u1',
    assignees: [],
    reminders: [],
    attachments: [],
    comments: [],
    checklists: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('resolveCardPlacementForUpsert', () => {
  it('preserves runtime placement when incoming omits pos and position is stale', () => {
    const prev = baseCard({ position: 8, pos: 9000 });
    const incoming = baseCard({ description: 'x', position: 0 });
    const resolved = resolveCardPlacementForUpsert(prev, incoming);
    expect(resolved.position).toBe(8);
    expect(resolved.pos).toBe(9000);
    expect(resolved.description).toBe('x');
  });

  it('preserves runtime placement when incoming pos is spread from stale position', () => {
    const prev = baseCard({ position: 8, pos: 9000 });
    const incoming = baseCard({
      description: 'x',
      position: 4,
      pos: spreadPosForIndex(4),
    });
    const resolved = resolveCardPlacementForUpsert(prev, incoming);
    expect(resolved.position).toBe(8);
    expect(resolved.pos).toBe(9000);
  });

  it('accepts incoming placement on list move', () => {
    const prev = baseCard({ listId: 'l1', position: 8, pos: 9000 });
    const incoming = baseCard({ listId: 'l2', position: 0, pos: 1500 });
    const resolved = resolveCardPlacementForUpsert(prev, incoming);
    expect(resolved.listId).toBe('l2');
    expect(resolved.position).toBe(0);
    expect(resolved.pos).toBe(1500);
  });
});
