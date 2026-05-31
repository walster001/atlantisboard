import type { Socket } from 'socket.io-client';
import { transformBoard } from '../../utils/transform.js';
import { api } from '../../utils/api.js';
import {
  emitSocketBoardCreated,
  emitSocketBoardDeleted,
  emitSocketBoardUpdated,
} from '../../utils/socketRealtimeBridge.js';
import { db } from '../../store/database.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { applyFlatFieldPatch, deferSocketWork, runtimeActiveBoardId } from './state.js';

export const BOARD_SOCKET_EVENTS = [
  'board:created',
  'board:updated',
  'board:patched',
  'board:deleted',
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
        void db.boards.get(data.boardId).then(async (existing) => {
          if (existing == null) {
            try {
              const response = await api.getBoard(data.boardId, { view: 'summary' });
              const board = transformBoard((response as { board: unknown }).board);
              if (runtimeActiveBoardId() === data.boardId) {
                useBoardRuntimeStore.getState().commitBoard(board);
              }
              await db.boards.put(board);
              emitSocketBoardUpdated({ boardId: data.boardId, board });
            } catch {
              /* no local copy and cannot load — user may not have access yet */
            }
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
}
