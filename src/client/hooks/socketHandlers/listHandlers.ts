import type { Socket } from 'socket.io-client';
import { db } from '../../store/database.js';
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
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().upsertList(list);
        }
        void db.lists.put(list).then(() => {
          emitSocketListUpdated({ boardId: data.boardId, list });
        });
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
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().applyListsBulkPositionPatch(
            data.orderedListIds,
            data.orderedPos,
          );
        }
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

  socket.on(
    'lists:positions-batch-updated',
    (data: { boardId: string; orderedListIds: string[]; orderedPos?: number[]; serverTs?: number }) => {
      deferSocketWork(() => {
        if (!Array.isArray(data.orderedListIds) || data.orderedListIds.length === 0) {
          return;
        }
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().applyListsBulkPositionPatch(
            data.orderedListIds,
            data.orderedPos,
          );
        }
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
            /* Dexie list position batch update failed */
          });
      });
    },
  );

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
