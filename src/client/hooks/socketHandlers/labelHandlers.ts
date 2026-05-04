import type { Socket } from 'socket.io-client';
import { db } from '../../store/database.js';
import {
  emitSocketBoardLabelsChanged,
  emitSocketCardUpdated,
} from '../../utils/socketRealtimeBridge.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { deferSocketWork, runtimeActiveBoardId } from './state.js';

export const LABEL_SOCKET_EVENTS = [
  'labels:removedBulk',
  'label:created',
  'label:updated',
  'label:patched',
  'label:deleted',
  'label:assigned',
  'label:removed',
] as const;

export function registerLabelHandlers(socket: Socket): void {
  socket.on(
    'labels:removedBulk',
    (data: { boardId: string; labelId: string; affectedCardIds: string[] }) => {
      deferSocketWork(() => {
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().applyLabelsRemovedBulk(data.labelId, data.affectedCardIds);
        }
        void db.cards
          .bulkGet(data.affectedCardIds)
          .then((cards) => {
            const nextCards = cards
              .filter((card): card is NonNullable<typeof card> => card != null)
              .map((card) => ({
                ...card,
                labels: card.labels.filter((label) => String(label.id) !== String(data.labelId)),
              }));
            if (nextCards.length > 0) {
              return db.cards.bulkPut(nextCards).then(() => {
                for (const card of nextCards) {
                  emitSocketCardUpdated({ boardId: data.boardId, card });
                }
              });
            }
            return undefined;
          })
          .catch(() => {
            /* Dexie bulk label patch failed */
          });
      });
    },
  );

  socket.on('label:created', (data: { boardId: string }) => {
    deferSocketWork(() => {
      emitSocketBoardLabelsChanged({ boardId: data.boardId });
    });
  });

  socket.on('label:updated', (data: { boardId: string }) => {
    deferSocketWork(() => {
      emitSocketBoardLabelsChanged({ boardId: data.boardId });
    });
  });

  socket.on('label:deleted', (data: { boardId: string }) => {
    deferSocketWork(() => {
      emitSocketBoardLabelsChanged({ boardId: data.boardId });
    });
  });

  socket.on('label:patched', (data: { boardId: string }) => {
    deferSocketWork(() => {
      emitSocketBoardLabelsChanged({ boardId: data.boardId });
    });
  });

  socket.on(
    'label:assigned',
    (data: {
      cardId: string;
      boardId: string;
      label: { id: string; name: string; color: string };
    }) => {
      deferSocketWork(() => {
        void db.cards
          .get(data.cardId)
          .then((existingDexie) => {
            const existingRuntime =
              runtimeActiveBoardId() === data.boardId
                ? useBoardRuntimeStore.getState().cardsById[data.cardId]
                : undefined;
            const existing = existingRuntime ?? existingDexie;
            if (!existing) {
              return;
            }
            const labelId = String(data.label.id);
            if (existing.labels.some((label) => String(label.id) === labelId)) {
              return;
            }
            const next = {
              ...existing,
              labels: [...existing.labels, { ...data.label, id: labelId }],
            };
            if (runtimeActiveBoardId() === data.boardId) {
              useBoardRuntimeStore.getState().upsertCard(next);
            }
            return db.cards.put(next).then(() => {
              emitSocketCardUpdated({ boardId: data.boardId, card: next });
            });
          })
          .catch(() => {
            /* Dexie label assign failed */
          });
      });
    },
  );

  socket.on(
    'label:removed',
    (data: { cardId: string; boardId: string; labelId: string }) => {
      deferSocketWork(() => {
        void db.cards
          .get(data.cardId)
          .then((existingDexie) => {
            const existingRuntime =
              runtimeActiveBoardId() === data.boardId
                ? useBoardRuntimeStore.getState().cardsById[data.cardId]
                : undefined;
            const existing = existingRuntime ?? existingDexie;
            if (!existing) {
              return;
            }
            const removedLabelId = String(data.labelId);
            const next = {
              ...existing,
              labels: existing.labels.filter((label) => String(label.id) !== removedLabelId),
            };
            if (runtimeActiveBoardId() === data.boardId) {
              useBoardRuntimeStore.getState().upsertCard(next);
            }
            return db.cards.put(next).then(() => {
              emitSocketCardUpdated({ boardId: data.boardId, card: next });
            });
          })
          .catch(() => {
            /* Dexie label remove failed */
          });
      });
    },
  );
}
