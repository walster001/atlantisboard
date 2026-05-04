import type { Socket } from 'socket.io-client';
import { db } from '../../store/database.js';
import {
  mergeDexieCardIfSnapshot,
  normalizeCardFromApi,
} from '../../utils/transform.js';
import {
  emitSocketCardDeleted,
  emitSocketCardUpdated,
  emitSocketCardsBulkColorUpdated,
} from '../../utils/socketRealtimeBridge.js';
import {
  forgetCardSocketDedupe,
  isRedundantCardSocketPayload,
} from '../../utils/cardSocketDedupe.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { spreadPosForIndex } from '../../../shared/utils/cardListPos.js';
import { env } from '../../config/env.js';
import {
  deferSocketWork,
  markCardEventTs,
  queueCardPatchedEvent,
  runtimeActiveBoardId,
  shouldApplyCardEvent,
  shouldApplyListOrderEvent,
} from './state.js';

export const CARD_SOCKET_EVENTS = [
  'card:created',
  'card:updated',
  'card:patched',
  'card:deleted',
  'cards:reordered',
  'cards:positions-batch-updated',
  'cards:bulk-color-updated',
  'card:duplicated',
] as const;

export function registerCardHandlers(socket: Socket): void {
  socket.on('card:created', (data: { cardId: string; boardId: string; data: unknown; serverTs?: number }) => {
    deferSocketWork(() => {
      if (!shouldApplyCardEvent(data.cardId, data.serverTs)) {
        return;
      }
      try {
        const card = normalizeCardFromApi(data.data, data.cardId);
        void db.cards.get(data.cardId).then((existingDexie) => {
          const existingRuntime =
            runtimeActiveBoardId() === data.boardId
              ? useBoardRuntimeStore.getState().cardsById[data.cardId]
              : undefined;
          const existing = existingRuntime ?? existingDexie ?? undefined;
          const merged = mergeDexieCardIfSnapshot(data.data, existing, card);
          if (isRedundantCardSocketPayload(data.cardId, merged)) {
            return;
          }
          if (runtimeActiveBoardId() === data.boardId) {
            useBoardRuntimeStore.getState().upsertCard(merged);
          }
          return db.cards.put(merged).then(() => {
            emitSocketCardUpdated({ boardId: data.boardId, card: merged });
          });
        });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on('card:updated', (data: { cardId: string; boardId: string; data: unknown; serverTs?: number }) => {
    deferSocketWork(() => {
      if (!shouldApplyCardEvent(data.cardId, data.serverTs)) {
        return;
      }
      try {
        const card = normalizeCardFromApi(data.data, data.cardId);
        void db.cards
          .get(data.cardId)
          .then((existingDexie) => {
            const existingRuntime =
              runtimeActiveBoardId() === data.boardId
                ? useBoardRuntimeStore.getState().cardsById[data.cardId]
                : undefined;
            const existing = existingRuntime ?? existingDexie ?? undefined;
            const merged = mergeDexieCardIfSnapshot(data.data, existing, card);
            if (isRedundantCardSocketPayload(data.cardId, merged)) {
              return;
            }
            if (runtimeActiveBoardId() === data.boardId) {
              useBoardRuntimeStore.getState().upsertCard(merged);
            }
            return db.cards.put(merged).then(() => {
              emitSocketCardUpdated({ boardId: data.boardId, card: merged });
            });
          })
          .catch(() => {
            /* Dexie put failed */
          });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on(
    'card:patched',
    (data: {
      cardId: string;
      boardId: string;
      changedFields: Record<string, unknown>;
      removedFields: string[];
      serverTs?: number;
    }) => {
      deferSocketWork(() => {
        if (!shouldApplyCardEvent(data.cardId, data.serverTs)) {
          return;
        }
        if (env.REALTIME_BULK_CARD_PATCH_ENABLED) {
          queueCardPatchedEvent({
            cardId: data.cardId,
            boardId: data.boardId,
            changedFields: data.changedFields,
            removedFields: data.removedFields,
            ...(data.serverTs !== undefined ? { serverTs: data.serverTs } : {}),
          });
          return;
        }
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
            const patched: Record<string, unknown> = { ...existing };
            for (const [key, value] of Object.entries(data.changedFields)) {
              patched[key] = value;
            }
            for (const key of data.removedFields) {
              delete patched[key];
            }
            const normalized = normalizeCardFromApi(patched, data.cardId);
            if (isRedundantCardSocketPayload(data.cardId, normalized)) {
              return;
            }
            if (runtimeActiveBoardId() === data.boardId) {
              useBoardRuntimeStore.getState().upsertCard(normalized);
            }
            return db.cards.put(normalized).then(() => {
              emitSocketCardUpdated({ boardId: data.boardId, card: normalized });
            });
          })
          .catch(() => {
            /* Dexie get/put failed */
          });
      });
    },
  );

  socket.on(
    'cards:reordered',
    (data: { boardId: string; listId: string; orderedCardIds: string[]; serverTs?: number }) => {
      deferSocketWork(() => {
        if (!shouldApplyListOrderEvent(data.boardId, data.listId, data.serverTs)) {
          return;
        }
        const orderedIds = data.orderedCardIds.map(String);
        void db.cards
          .bulkGet(orderedIds)
          .then(async (cards) => {
            const nextCards = cards
              .map((card, idx) => {
                if (card == null) {
                  return null;
                }
                return {
                  ...card,
                  listId: data.listId,
                  position: idx,
                  pos: spreadPosForIndex(idx),
                };
              })
              .filter((card): card is NonNullable<typeof card> => card != null);
            if (nextCards.length === 0) {
              return;
            }
            if (runtimeActiveBoardId() === data.boardId) {
              for (const card of nextCards) {
                useBoardRuntimeStore.getState().upsertCard(card);
              }
              useBoardRuntimeStore.getState().applyCardsReorderedInList(data.listId, orderedIds);
            }
            await db.cards.bulkPut(nextCards);
            markCardEventTs(
              nextCards.map((card) => card.id),
              data.serverTs,
            );
            for (const card of nextCards) {
              if (!isRedundantCardSocketPayload(card.id, card)) {
                emitSocketCardUpdated({ boardId: data.boardId, card });
              }
            }
          })
          .catch(() => {
            /* Dexie update failed */
          });
      });
    },
  );

  socket.on(
    'cards:positions-batch-updated',
    (data: {
      boardId: string;
      fromListId?: string;
      toListId?: string;
      movedCardId?: string;
      position?: number;
      lists?: Array<{ listId: string; orderedCardIds: string[]; orderedPos?: number[] }>;
      serverTs?: number;
    }) => {
      deferSocketWork(() => {
        const listPayloads = (Array.isArray(data.lists) ? data.lists : []).filter((entry) =>
          shouldApplyListOrderEvent(data.boardId, entry.listId, data.serverTs),
        );
        if (listPayloads.length === 0) {
          return;
        }
        void Promise.all(
          listPayloads.map(async (entry) => {
            const orderedIds = (entry.orderedCardIds ?? []).map(String);
            const rawPos = entry.orderedPos;
            const hasServerPos =
              Array.isArray(rawPos) &&
              rawPos.length === orderedIds.length &&
              rawPos.every((position) => typeof position === 'number' && Number.isFinite(position));
            const nextCards = (await db.cards.bulkGet(orderedIds))
              .map((card, idx) => {
                if (card == null) {
                  return null;
                }
                const pos = hasServerPos ? rawPos[idx]! : spreadPosForIndex(idx);
                return {
                  ...card,
                  listId: entry.listId,
                  position: idx,
                  pos,
                };
              })
              .filter((card): card is NonNullable<typeof card> => card != null);
            if (runtimeActiveBoardId() === data.boardId) {
              for (const card of nextCards) {
                useBoardRuntimeStore.getState().upsertCard(card);
              }
              useBoardRuntimeStore.getState().applyCardsReorderedInList(
                entry.listId,
                orderedIds,
                hasServerPos ? rawPos : undefined,
              );
            }
            if (nextCards.length > 0) {
              await db.cards.bulkPut(nextCards);
              markCardEventTs(
                nextCards.map((card) => card.id),
                data.serverTs,
              );
              for (const card of nextCards) {
                if (!isRedundantCardSocketPayload(card.id, card)) {
                  emitSocketCardUpdated({ boardId: data.boardId, card });
                }
              }
            }
          }),
        ).catch(() => {
          /* batch positions Dexie patch failed */
        });
      });
    },
  );

  socket.on('card:deleted', (data: { cardId: string; boardId: string }) => {
    deferSocketWork(() => {
      forgetCardSocketDedupe(data.cardId);
      if (runtimeActiveBoardId() === data.boardId) {
        useBoardRuntimeStore.getState().removeCard(data.cardId);
      }
      void db.cards
        .delete(data.cardId)
        .then(() => {
          emitSocketCardDeleted({ boardId: data.boardId, cardId: data.cardId });
        })
        .catch(() => {
          /* Dexie delete failed */
        });
    });
  });

  socket.on(
    'cards:bulk-color-updated',
    (data: { boardId: string; listId?: string; color: string; serverTs?: number }) => {
      deferSocketWork(() => {
        const colorRaw = typeof data.color === 'string' ? data.color : '';
        const trimmed = colorRaw.trim();
        const scopedListId =
          typeof data.listId === 'string' && data.listId.trim() !== '' ? data.listId.trim() : null;
        if (runtimeActiveBoardId() === data.boardId) {
          useBoardRuntimeStore.getState().applyCardsBulkColor(scopedListId, trimmed);
        }
        const query =
          scopedListId != null
            ? db.cards.where('listId').equals(scopedListId)
            : db.cards.where('boardId').equals(data.boardId);
        void query
          .modify((card) => {
            if (trimmed === '') {
              delete card.color;
            } else {
              card.color = trimmed;
            }
          })
          .then(() => {
            emitSocketCardsBulkColorUpdated({ boardId: data.boardId });
          })
          .catch(() => {
            /* bulk color Dexie patch failed */
          });
      });
    },
  );

  socket.on(
    'card:duplicated',
    (data: { duplicatedCardId: string; boardId: string; data: unknown }) => {
      deferSocketWork(() => {
        try {
          const card = normalizeCardFromApi(data.data, data.duplicatedCardId);
          if (runtimeActiveBoardId() === data.boardId) {
            useBoardRuntimeStore.getState().upsertCard(card);
          }
          void db.cards.put(card).then(() => {
            emitSocketCardUpdated({ boardId: data.boardId, card });
          });
        } catch {
          /* invalid payload */
        }
      });
    },
  );
}
