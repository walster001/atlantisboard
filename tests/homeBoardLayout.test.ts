import { describe, expect, it } from 'bun:test';
import type { BoardDB } from '../src/client/store/database.js';
import {
  moveBoardToHoverSlot,
  moveHomeBoardOptimistic,
} from '../src/client/hooks/homeBoard/homeBoardLayout.js';

function board(id: string, workspaceId: string, position: number): BoardDB {
  const t = new Date('2024-01-01');
  return {
    id,
    workspaceId,
    position,
    name: id,
    visibility: 'workspace',
    ownerId: 'u1',
    members: [],
    settings: {
      allowComments: true,
      allowAttachments: true,
      cardCoverImages: true,
      showReminders: true,
    },
    createdAt: t,
    updatedAt: t,
  };
}

describe('moveBoardToHoverSlot', () => {
  it('reorders by scope list order, not raw position fields', () => {
    /** Display order C, A, B — positions still 0,1,2 from server. */
    const scope = [board('c', 'ws1', 0), board('a', 'ws1', 1), board('b', 'ws1', 2)];
    const next = moveBoardToHoverSlot(scope, 'a', 'c');
    expect(next?.map((b) => b.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('moveHomeBoardOptimistic', () => {
  it('reorders within a workspace using saved home board order', () => {
    const boards = [
      board('a', 'ws1', 0),
      board('b', 'ws1', 1),
      board('c', 'ws1', 2),
    ];
    const homeOrder = { ws1: ['c', 'a', 'b'] };
    const next = moveHomeBoardOptimistic(boards, 'b', 'ws1', 'a', homeOrder);
    const ids = next
      ?.filter((b) => b.workspaceId === 'ws1')
      .sort((x, y) => x.position - y.position)
      .map((b) => b.id);
    expect(ids).toEqual(['c', 'b', 'a']);
  });

  it('inserts before anchor when moving across workspaces', () => {
    const boards = [
      board('a', 'ws1', 0),
      board('x', 'ws2', 0),
      board('y', 'ws2', 1),
    ];
    const homeOrder = { ws2: ['y', 'x'] };
    const next = moveHomeBoardOptimistic(boards, 'a', 'ws2', 'x', homeOrder);
    const ws2Ids = next
      ?.filter((b) => b.workspaceId === 'ws2')
      .sort((x, y) => x.position - y.position)
      .map((b) => b.id);
    expect(ws2Ids).toEqual(['y', 'a', 'x']);
  });
});
