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
      showReminders: true,
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

  it('upsertList keeps position/pos after bulk reorder when list:updated is older than batch marker', () => {
    const t0 = new Date('2020-01-01T00:00:00.000Z');
    const tBatch = new Date('2020-01-02T00:00:00.000Z').getTime();
    const l1: ListDB = { ...sampleList('l1', 0), pos: 1000, updatedAt: t0 };
    const l2: ListDB = { ...sampleList('l2', 1), pos: 2000, updatedAt: t0 };
    useBoardRuntimeStore.getState().hydrateFromSnapshot({
      boardId: 'b1',
      board: sampleBoard(),
      lists: [l1, l2],
      cardsByList: new Map([
        ['l1', []],
        ['l2', []],
      ]),
    });
    useBoardRuntimeStore.getState().applyListsBulkPositionPatch(['l2', 'l1'], [1500, 2500], tBatch);
    const staleL1: ListDB = {
      ...l1,
      name: 'Renamed',
      position: 0,
      pos: 1000,
      updatedAt: t0,
    };
    useBoardRuntimeStore.getState().upsertList(staleL1);
    const s = useBoardRuntimeStore.getState();
    expect(s.listsById.l1?.name).toBe('Renamed');
    expect(s.listsById.l1?.position).toBe(1);
    expect(s.listsById.l1?.pos).toBe(2500);
    expect(s.orderedListIds).toEqual(['l2', 'l1']);
  });

  it('upsertCard keeps kanban index when API returns stale integer position', () => {
    const l1 = sampleList('l1', 0);
    const cards: CardDB[] = [
      { ...sampleCard('c0', 'l1', 0), pos: 1000 },
      { ...sampleCard('c1', 'l1', 1), pos: 2000 },
      { ...sampleCard('c2', 'l1', 2), pos: 3000 },
      { ...sampleCard('c3', 'l1', 3), pos: 4000 },
      { ...sampleCard('c4', 'l1', 4), pos: 5000 },
      { ...sampleCard('c5', 'l1', 5), pos: 6000 },
      { ...sampleCard('c6', 'l1', 6), pos: 7000 },
      { ...sampleCard('c7', 'l1', 7), pos: 8000 },
      { ...sampleCard('c8', 'l1', 8), pos: 9000 },
    ];
    useBoardRuntimeStore.getState().hydrateFromSnapshot({
      boardId: 'b1',
      board: sampleBoard(),
      lists: [l1],
      cardsByList: new Map([['l1', cards]]),
    });
    useBoardRuntimeStore.getState().applyCardsReorderedInList('l1', [
      'c0',
      'c1',
      'c2',
      'c3',
      'c5',
      'c6',
      'c7',
      'c8',
      'c4',
    ]);
    const detailSavePayload: CardDB = {
      ...useBoardRuntimeStore.getState().cardsById.c4!,
      description: '{"type":"doc","content":[]}',
      position: 4,
    };
    useBoardRuntimeStore.getState().upsertCard(detailSavePayload);
    const ids = useBoardRuntimeStore.getState().cardIdsByListId.l1 ?? [];
    expect(ids.indexOf('c4')).toBe(8);
  });
});
