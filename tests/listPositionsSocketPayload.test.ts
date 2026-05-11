import { describe, it, expect } from 'bun:test';
import { normalizeListsPositionsBatchPayload } from '../src/client/hooks/socketHandlers/listHandlers.js';

describe('normalizeListsPositionsBatchPayload', () => {
  it('passes through flat server payload', () => {
    const flat = {
      boardId: 'b1',
      orderedListIds: ['a', 'b'],
      orderedPos: [1000, 2000],
      serverTs: 42,
    };
    expect(normalizeListsPositionsBatchPayload(flat)).toEqual(flat);
  });

  it('unwraps batched envelope from socketIO flushBatch', () => {
    const latest = {
      boardId: 'b1',
      orderedListIds: ['x', 'y', 'z'],
      orderedPos: [500, 1500, 2500],
      serverTs: 10,
    };
    const wrapped = {
      batchSize: 1,
      events: [latest],
      latest,
      serverTs: 99,
    };
    expect(normalizeListsPositionsBatchPayload(wrapped)).toEqual({
      boardId: 'b1',
      orderedListIds: ['x', 'y', 'z'],
      orderedPos: [500, 1500, 2500],
      serverTs: 99,
    });
  });

  it('returns null for invalid input', () => {
    expect(normalizeListsPositionsBatchPayload(null)).toBeNull();
    expect(normalizeListsPositionsBatchPayload({})).toBeNull();
    expect(normalizeListsPositionsBatchPayload({ latest: {} })).toBeNull();
  });
});
