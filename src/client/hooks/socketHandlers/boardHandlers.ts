import type { Socket } from 'socket.io-client';
import { db, type BoardDB } from '../../store/database.js';
import { transformBoard } from '../../utils/transform.js';
import {
  emitSocketBoardCreated,
  emitSocketBoardDeleted,
  emitSocketBoardUpdated,
  emitSocketHomeBoardsPositionsSynced,
} from '../../utils/socketRealtimeBridge.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { applyFlatFieldPatch, deferSocketWork, runtimeActiveBoardId } from './state.js';

export const BOARD_SOCKET_EVENTS = [
  'board:created',
  'board:updated',
  'board:patched',
  'board:deleted',
  'boards:positionsSynced',
] as const;

export function registerBoardHandlers(socket: Socket): void {
  socket.on('board:created', (data: { boardId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const board = transformBoard(data.data);
        void db.boards.put(board).then(() => {
          emitSocketBoardCreated({ boardId: data.boardId, board });
        });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on('board:updated', (data: { boardId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const board = transformBoard(data.data);
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().commitBoard(board);
        }
        void db.boards.put(board).then(() => {
          emitSocketBoardUpdated({ boardId: data.boardId, board });
        });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on(
    'board:patched',
    (data: {
      boardId: string;
      changedFields: Record<string, unknown>;
      removedFields: string[];
      serverTs?: number;
      version?: number;
    }) => {
      deferSocketWork(() => {
        void db.boards.get(data.boardId).then((existing) => {
          if (existing == null) {
            return;
          }
          const patched = applyFlatFieldPatch(existing, data.changedFields, data.removedFields);
          if (runtimeActiveBoardId() === data.boardId) {
            useBoardRuntimeStore.getState().commitBoard(patched);
          }
          void db.boards.put(patched).then(() => {
            emitSocketBoardUpdated({ boardId: data.boardId, board: patched });
          });
        });
      });
    },
  );

  socket.on('board:deleted', (data: { boardId: string }) => {
    deferSocketWork(() => {
      void db.boards.delete(data.boardId).then(() => {
        emitSocketBoardDeleted({ boardId: data.boardId });
      });
    });
  });

  socket.on(
    'boards:positionsSynced',
    (data: {
      workspaceId: string;
      orderedBoardIds: readonly string[];
      serverTs?: number;
      sequence?: number;
    }) => {
      deferSocketWork(() => {
        const wid = data.workspaceId.trim();
        const order = [...data.orderedBoardIds].map((id) => String(id));
        if (wid === '' || order.length === 0) {
          return;
        }
        const serverTs = data.serverTs;
        const sequence = data.sequence;
        emitSocketHomeBoardsPositionsSynced({
          workspaceId: wid,
          orderedBoardIds: order,
          ...(serverTs !== undefined ? { serverTs } : {}),
          ...(sequence !== undefined ? { sequence } : {}),
        });
        void (async () => {
          try {
            const rowKey = (w: string | undefined): string =>
              w == null || w === '' ? '' : String(w).trim();
            const ids = order.filter((id) => id !== '');
            if (ids.length === 0) {
              return;
            }
            const rows = await db.boards.bulkGet(ids);
            const byId = new Map<string, BoardDB>();
            for (let j = 0; j < ids.length; j++) {
              const row = rows[j];
              if (row != null) {
                byId.set(ids[j]!, row);
              }
            }
            const puts: BoardDB[] = [];
            for (let i = 0; i < order.length; i++) {
              const id = order[i];
              if (id === '') {
                continue;
              }
              const existing = byId.get(id);
              if (existing == null) {
                continue;
              }
              if (rowKey(existing.workspaceId) !== wid) {
                continue;
              }
              puts.push({
                ...existing,
                position: i,
              });
            }
            if (puts.length > 0) {
              await db.boards.bulkPut(puts);
            }
          } catch {
            /* Dexie home board position sync failed */
          }
        })();
      });
    },
  );
}
