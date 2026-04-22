import { describe, it, expect, beforeEach } from 'bun:test';
import { useBoardRuntimeStore, buildKanbanCardsMapFromRuntimeState } from '../src/client/store/boardRuntimeStore.js';
import type { BoardDB, CardDB, ListDB } from '../src/client/store/database.js';

function sampleBoard(): BoardDB {
  return {
    id: 'b1',
    position: 0,
    name: 'B',
    visibility: 'private',
    ownerId: 'u1',
    members: [],
    settings: {
      allowComments: true,
      allowAttachments: true,
      cardCoverImages: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function sampleList(id: string, position: number): ListDB {
  return {
    id,
    boardId: 'b1',
    name: `L${id}`,
    position,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function sampleCard(id: string, listId: string, position: number): CardDB {
  return {
    id,
    listId,
    boardId: 'b1',
    title: id,
    position,
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
  };
}

describe('boardRuntimeStore', () => {
  beforeEach(() => {
    useBoardRuntimeStore.getState().clear();
  });

  it('hydrates snapshot and exposes ordered lists and cards map', () => {
    const l1 = sampleList('l1', 0);
    const c1 = sampleCard('c1', 'l1', 0);
    const map = new Map<string, CardDB[]>([['l1', [c1]]]);
    useBoardRuntimeStore.getState().hydrateFromSnapshot({
      boardId: 'b1',
      board: sampleBoard(),
      lists: [l1],
      cardsByList: map,
    });
    const s = useBoardRuntimeStore.getState();
    expect(s.activeBoardId).toBe('b1');
    expect(s.orderedListIds).toEqual(['l1']);
    const m = buildKanbanCardsMapFromRuntimeState(s);
    expect(m.get('l1')?.map((c) => c.id)).toEqual(['c1']);
  });

  it('removeList drops list and its cards', () => {
    const l1 = sampleList('l1', 0);
    const c1 = sampleCard('c1', 'l1', 0);
    useBoardRuntimeStore.getState().hydrateFromSnapshot({
      boardId: 'b1',
      board: sampleBoard(),
      lists: [l1],
      cardsByList: new Map([['l1', [c1]]]),
    });
    useBoardRuntimeStore.getState().removeList('l1');
    const s = useBoardRuntimeStore.getState();
    expect(s.listsById.l1).toBeUndefined();
    expect(s.cardsById.c1).toBeUndefined();
  });
});
