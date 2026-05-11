import type { Socket } from 'socket.io-client';
import { db, type ListDB } from '../../store/database.js';
import { transformList } from '../../utils/transform.js';
import {
  emitSocketListCreated,
  emitSocketListDeleted,
  emitSocketListUpdated,
  emitSocketListsBulkColorUpdated,
} from '../../utils/socketRealtimeBridge.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { spreadListPosForIndex } from '../../../shared/utils/listPos.js';
import {
  applyFlatFieldPatch,
  deferSocketWork,
  runtimeActiveBoardId,
} from './state.js';

/** Coalesce rapid `list:updated` (e.g. Mongo change streams after list move) into one runtime commit per tick. */
type PendingListUpdateEntry = { readonly list: ListDB; readonly rev: number };
const pendingListUpdatedByBoard = new Map<string, Map<string, PendingListUpdateEntry>>();
/** Incremented when a bulk list position event is applied so a later microtask flush cannot re-apply stale `list:updated` rows. */
const listBulkPositionRevByBoard = new Map<string, number>();
let listUpdatedFlushQueued = false;

function getListBulkPositionRev(boardId: string): number {
  return listBulkPositionRevByBoard.get(boardId) ?? 0;
}

function bumpListBulkPositionRev(boardId: string): void {
  listBulkPositionRevByBoard.set(boardId, getListBulkPositionRev(boardId) + 1);
}

function discardPendingListUpdates(boardId: string): void {
  pendingListUpdatedByBoard.delete(boardId);
}

/** Payload after `normalizeListsPositionsBatchPayload` (flat server emit). */
export type ListsPositionsBatchPayload = {
  readonly boardId: string;
  readonly orderedListIds: readonly string[];
  readonly orderedPos?: readonly number[];
  readonly serverTs?: number;
};

function readListsPositionsFromObject(o: Record<string, unknown>): ListsPositionsBatchPayload | null {
  const boardId = o.boardId;
  const orderedListIdsRaw = o.orderedListIds;
  if (
    typeof boardId !== 'string' ||
    boardId === '' ||
    !Array.isArray(orderedListIdsRaw) ||
    orderedListIdsRaw.length === 0
  ) {
    return null;
  }
  const orderedListIds = orderedListIdsRaw.map((id) => String(id));
  const orderedPosRaw = o.orderedPos;
  const serverTsRaw = o.serverTs;
  const orderedPos =
    Array.isArray(orderedPosRaw) &&
    orderedPosRaw.length === orderedListIds.length &&
    orderedPosRaw.every((p) => typeof p === 'number' && Number.isFinite(p))
      ? (orderedPosRaw as readonly number[])
      : undefined;
  const serverTs =
    typeof serverTsRaw === 'number' && Number.isFinite(serverTsRaw) ? serverTsRaw : undefined;
  const out: ListsPositionsBatchPayload = { boardId, orderedListIds };
  return {
    ...out,
    ...(orderedPos != null ? { orderedPos } : {}),
    ...(serverTs != null ? { serverTs } : {}),
  };
}

/**
 * `emitToBoard` may send a flat body or a batched envelope when `REALTIME_SERVER_BATCHING_ENABLED`
 * includes `lists:positions-batch-updated` (see `src/server/utils/socketIO.ts`).
 */
export function normalizeListsPositionsBatchPayload(raw: unknown): ListsPositionsBatchPayload | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const direct = readListsPositionsFromObject(o);
  if (direct != null) {
    return direct;
  }
  const latest = o.latest;
  if (latest != null && typeof latest === 'object') {
    const inner = readListsPositionsFromObject(latest as Record<string, unknown>);
    if (inner == null) {
      return null;
    }
    const wrapperTs =
      typeof o.serverTs === 'number' && Number.isFinite(o.serverTs) ? (o.serverTs as number) : undefined;
    const innerTs = inner.serverTs;
    const serverTs =
      wrapperTs != null && innerTs != null
        ? Math.max(wrapperTs, innerTs)
        : (wrapperTs ?? innerTs);
    if (serverTs != null) {
      return { ...inner, serverTs };
    }
    return inner;
  }
  return null;
}

function scheduleListUpdatedFlush(): void {
  if (listUpdatedFlushQueued) {
    return;
  }
  listUpdatedFlushQueued = true;
  queueMicrotask(() => {
    listUpdatedFlushQueued = false;
    const boards = [...pendingListUpdatedByBoard.entries()];
    for (const [boardId, byListId] of boards) {
      pendingListUpdatedByBoard.delete(boardId);
      if (runtimeActiveBoardId() !== boardId) {
        continue;
      }
      const currentRev = getListBulkPositionRev(boardId);
      const lists = [...byListId.values()]
        .filter((e) => e.rev === currentRev)
        .map((e) => e.list);
      if (lists.length === 0) {
        continue;
      }
      useBoardRuntimeStore.getState().upsertListsBatch(lists);
      void db.lists
        .bulkPut(lists)
        .then(() => {
          for (const list of lists) {
            emitSocketListUpdated({ boardId, list });
          }
        })
        .catch(() => {
          /* Dexie list bulk put */
        });
    }
  });
}

export const LIST_SOCKET_EVENTS = [
  'list:created',
  'list:updated',
  'list:patched',
  'list:deleted',
  'lists:reordered',
  'lists:positions-batch-updated',
  'lists:bulk-color-updated',
] as const;

export function registerListHandlers(socket: Socket): void {
  socket.on('list:created', (data: { listId: string; boardId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const list = transformList(data.data);
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().upsertList(list);
        }
        void db.lists.put(list).then(() => {
          emitSocketListCreated({ boardId: data.boardId, list });
        });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on('list:updated', (data: { listId: string; boardId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const list = transformList(data.data);
        if (runtimeActiveBoardId() !== data.boardId) {
          void db.lists.put(list).then(() => {
            emitSocketListUpdated({ boardId: data.boardId, list });
          });
          return;
        }
        let byId = pendingListUpdatedByBoard.get(data.boardId);
        if (byId == null) {
          byId = new Map();
          pendingListUpdatedByBoard.set(data.boardId, byId);
        }
        byId.set(list.id, { list, rev: getListBulkPositionRev(data.boardId) });
        scheduleListUpdatedFlush();
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on(
    'list:patched',
    (data: {
      listId: string;
      boardId: string;
      changedFields: Record<string, unknown>;
      removedFields: string[];
      serverTs?: number;
      version?: number;
    }) => {
      deferSocketWork(() => {
        void db.lists.get(data.listId).then((existing) => {
          if (existing == null) {
            return;
          }
          const patched = applyFlatFieldPatch(existing, data.changedFields, data.removedFields);
          if (runtimeActiveBoardId() === data.boardId) {
            useBoardRuntimeStore.getState().upsertList(patched);
          }
          void db.lists.put(patched).then(() => {
            emitSocketListUpdated({ boardId: data.boardId, list: patched });
          });
        });
      });
    },
  );

  socket.on('list:deleted', (data: { listId: string; boardId: string }) => {
    deferSocketWork(() => {
      pendingListUpdatedByBoard.get(data.boardId)?.delete(data.listId);
      if (runtimeActiveBoardId() === data.boardId) {
        useBoardRuntimeStore.getState().removeList(data.listId);
      }
      void db.cards
        .where('listId')
        .equals(data.listId)
        .delete()
        .then(() => db.lists.delete(data.listId))
        .then(() => {
          emitSocketListDeleted({ boardId: data.boardId, listId: data.listId });
        });
    });
  });

  socket.on(
    'lists:reordered',
    (data: { boardId: string; orderedListIds: string[]; orderedPos?: number[]; serverTs?: number }) => {
      deferSocketWork(() => {
        discardPendingListUpdates(data.boardId);
        const reorderTs =
          typeof data.serverTs === 'number' && Number.isFinite(data.serverTs)
            ? data.serverTs
            : Date.now();
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().applyListsBulkPositionPatch(
            data.orderedListIds,
            data.orderedPos,
            reorderTs,
          );
        }
        bumpListBulkPositionRev(data.boardId);
        void db.lists
          .where('boardId')
          .equals(data.boardId)
          .toArray()
          .then(async (lists) => {
            const orderedPos = data.orderedPos;
            const hasServerPos =
              Array.isArray(orderedPos) &&
              orderedPos.length === data.orderedListIds.length &&
              orderedPos.every((p) => typeof p === 'number' && Number.isFinite(p));
            const nextLists = lists.map((list) => {
              const idx = data.orderedListIds.indexOf(list.id);
              if (idx < 0) {
                return list;
              }
              const pos = hasServerPos ? orderedPos[idx]! : spreadListPosForIndex(idx);
              return { ...list, position: idx, pos };
            });
            if (nextLists.length > 0) {
              await db.lists.bulkPut(nextLists);
            }
          })
          .catch(() => {
            /* Dexie list reorder failed */
          });
      });
    },
  );

  socket.on('lists:positions-batch-updated', (raw: unknown) => {
    deferSocketWork(() => {
      const data = normalizeListsPositionsBatchPayload(raw);
      if (data == null) {
        return;
      }
      discardPendingListUpdates(data.boardId);
      const batchTs =
        typeof data.serverTs === 'number' && Number.isFinite(data.serverTs)
          ? data.serverTs
          : Date.now();
      const orderedListIds = [...data.orderedListIds];
      const orderedPos = data.orderedPos != null ? [...data.orderedPos] : undefined;
      if (runtimeActiveBoardId() === data.boardId) {
        useBoardRuntimeStore.getState().applyListsBulkPositionPatch(orderedListIds, orderedPos, batchTs);
      }
      bumpListBulkPositionRev(data.boardId);
      void db.lists
        .where('boardId')
        .equals(data.boardId)
        .toArray()
        .then(async (lists) => {
          const hasServerPos =
            Array.isArray(orderedPos) &&
            orderedPos.length === orderedListIds.length &&
            orderedPos.every((p) => typeof p === 'number' && Number.isFinite(p));
          const nextLists = lists.map((list) => {
            const idx = orderedListIds.indexOf(list.id);
            if (idx < 0) {
              return list;
            }
            const pos = hasServerPos ? orderedPos[idx]! : spreadListPosForIndex(idx);
            return { ...list, position: idx, pos };
          });
          if (nextLists.length > 0) {
            await db.lists.bulkPut(nextLists);
          }
        })
        .catch(() => {
          /* Dexie list position batch update failed */
        });
    });
  });

  socket.on('lists:bulk-color-updated', (data: { boardId: string; color: string; serverTs?: number }) => {
    deferSocketWork(() => {
      const trimmed = typeof data.color === 'string' ? data.color.trim() : '';
      if (runtimeActiveBoardId() === data.boardId) {
        useBoardRuntimeStore.getState().applyListsBulkColor(trimmed);
      }
      void db.lists
        .where('boardId')
        .equals(data.boardId)
        .modify((list) => {
          if (trimmed === '') {
            delete list.color;
          } else {
            list.color = trimmed;
          }
        })
        .then(() => {
          emitSocketListsBulkColorUpdated({ boardId: data.boardId });
        })
        .catch(() => {
          /* bulk list colour Dexie patch failed */
        });
    });
  });
}
