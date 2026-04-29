import { useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { socketClient } from '../utils/socket.js';
import { db, type BoardDB, type WorkspaceDB } from '../store/database.js';
import {
  transformBoard,
  transformWorkspace,
  transformList,
  mergeDexieCardIfSnapshot,
  normalizeCardFromApi,
} from '../utils/transform.js';
import {
  emitSocketBoardCreated,
  emitSocketBoardDeleted,
  emitSocketBoardUpdated,
  emitSocketCardDeleted,
  emitSocketCardUpdated,
  emitSocketListCreated,
  emitSocketListDeleted,
  emitSocketListUpdated,
  emitSocketWorkspaceCreated,
  emitSocketWorkspaceDeleted,
  emitSocketWorkspaceUpdated,
  emitSocketBoardLabelsChanged,
  emitSocketInvitesChanged,
  emitSocketHomeBoardsPositionsSynced,
  emitSocketCardsBulkColorUpdated,
  emitSocketListsBulkColorUpdated,
  type SocketInvitesChangedPayload,
} from '../utils/socketRealtimeBridge.js';
import {
  clearCardSocketDedupeCache,
  forgetCardSocketDedupe,
  isRedundantCardSocketPayload,
} from '../utils/cardSocketDedupe.js';
import { useBoardRuntimeStore } from '../store/boardRuntimeStore.js';
import { spreadPosForIndex } from '../../shared/utils/cardListPos.js';
import { env } from '../config/env.js';
import { logBoardRealtimePatchFlush } from '../perf/boardPerf.js';

function runtimeActiveBoardId(): string | null {
  return useBoardRuntimeStore.getState().activeBoardId;
}

/** Yields so the WebSocket/engine.io message callback returns before transform/IDB work. */
function deferSocketWork(fn: () => void): void {
  queueMicrotask(fn);
}

/**
 * Join `workspace:*` only when this device’s user is an owner/member and not board-scoped-only on
 * home; otherwise leave. Prevents ex-members from receiving `board:updated` fan-out that re-adds tiles
 * after `board:deleted` / workspace removal.
 */
function canJoinWorkspaceRoomForLocalUser(workspace: WorkspaceDB, localUserId: string): boolean {
  const uid = localUserId.trim();
  if (uid === '') {
    return false;
  }
  const boardScoped = workspace.boardScopedHomeOnly === true;
  const inWorkspace =
    workspace.ownerId === uid || workspace.members.some((m) => m.userId === uid);
  return !boardScoped && inWorkspace;
}

const joinedWorkspaceRoomIds = new Set<string>();
let resyncWorkspaceRoomsInFlight: Promise<void> | null = null;
let resyncWorkspaceRoomsQueued = false;

function applyWorkspaceRoomMembership(workspaceId: string, shouldJoin: boolean): void {
  const id = workspaceId.trim();
  if (id === '') {
    return;
  }
  if (shouldJoin) {
    if (!joinedWorkspaceRoomIds.has(id)) {
      joinedWorkspaceRoomIds.add(id);
      socketClient.joinWorkspace(id);
    }
  } else if (joinedWorkspaceRoomIds.has(id)) {
    joinedWorkspaceRoomIds.delete(id);
    socketClient.leaveWorkspace(id);
  }
}

function resetJoinedWorkspaceRooms(): void {
  joinedWorkspaceRoomIds.clear();
}

async function performWorkspaceRoomResyncFromDexie(): Promise<void> {
  const uid = await getLocalUserId();
  const workspaces = await db.workspaces.toArray();
  const desired = new Set<string>();

  for (const workspace of workspaces) {
    const id = workspace.id.trim();
    if (id === '') {
      continue;
    }
    if (canJoinWorkspaceRoomForLocalUser(workspace, uid)) {
      desired.add(id);
    }
  }

  for (const id of desired) {
    applyWorkspaceRoomMembership(id, true);
  }
  const current = [...joinedWorkspaceRoomIds];
  for (const id of current) {
    if (!desired.has(id)) {
      applyWorkspaceRoomMembership(id, false);
    }
  }
}

/** Re-read Dexie workspaces and join/leave `workspace:*` rooms for the signed-in user. */
export async function resyncWorkspaceSocketRoomsFromDexie(): Promise<void> {
  if (resyncWorkspaceRoomsInFlight != null) {
    resyncWorkspaceRoomsQueued = true;
    return resyncWorkspaceRoomsInFlight;
  }
  resyncWorkspaceRoomsInFlight = (async () => {
    do {
      resyncWorkspaceRoomsQueued = false;
      await performWorkspaceRoomResyncFromDexie();
    } while (resyncWorkspaceRoomsQueued);
  })().finally(() => {
    resyncWorkspaceRoomsInFlight = null;
  });
  return resyncWorkspaceRoomsInFlight;
}

function onSocketConnectResyncWorkspaceRooms(): void {
  resetJoinedWorkspaceRooms();
  void resyncWorkspaceSocketRoomsFromDexie();
}

/** Multiple routes mount `useSocket`; handlers must attach exactly once per socket. */
let globalRealtimeHandlerRefCount = 0;
let reconnectListenerSocket: Socket | null = null;
let localUserIdCache: string | null = null;
let localUserIdLoadPromise: Promise<string> | null = null;
const lastCardEventTsById = new Map<string, number>();
const lastListOrderEventTsByKey = new Map<string, number>();
type PendingCardPatchEvent = {
  readonly cardId: string;
  readonly boardId: string;
  readonly changedFields: Readonly<Record<string, unknown>>;
  readonly removedFields: readonly string[];
  readonly serverTs?: number;
};
const pendingCardPatchedEvents = new Map<string, PendingCardPatchEvent>();
let cardPatchFlushQueued = false;

function shouldApplyCardEvent(cardId: string, serverTs: unknown): boolean {
  if (typeof serverTs !== 'number' || !Number.isFinite(serverTs)) {
    return true;
  }
  const id = String(cardId).trim();
  if (id === '') {
    return true;
  }
  const prev = lastCardEventTsById.get(id);
  if (prev !== undefined && serverTs < prev) {
    return false;
  }
  lastCardEventTsById.set(id, serverTs);
  return true;
}

function shouldApplyListOrderEvent(boardId: string, listId: string, serverTs: unknown): boolean {
  if (typeof serverTs !== 'number' || !Number.isFinite(serverTs)) {
    return true;
  }
  const key = `${String(boardId).trim()}:${String(listId).trim()}`;
  if (key === ':') {
    return true;
  }
  const prev = lastListOrderEventTsByKey.get(key);
  if (prev !== undefined && serverTs < prev) {
    return false;
  }
  lastListOrderEventTsByKey.set(key, serverTs);
  return true;
}

function markCardEventTs(cardIds: readonly string[], serverTs: unknown): void {
  if (typeof serverTs !== 'number' || !Number.isFinite(serverTs)) {
    return;
  }
  for (const id of cardIds) {
    const key = String(id).trim();
    if (key === '') {
      continue;
    }
    const prev = lastCardEventTsById.get(key);
    if (prev === undefined || serverTs >= prev) {
      lastCardEventTsById.set(key, serverTs);
    }
  }
}

function coalesceCardPatchedEvent(next: PendingCardPatchEvent): void {
  const prev = pendingCardPatchedEvents.get(next.cardId);
  if (prev == null) {
    pendingCardPatchedEvents.set(next.cardId, next);
    return;
  }
  const mergedChanged: Record<string, unknown> = { ...prev.changedFields, ...next.changedFields };
  const removed = new Set<string>(prev.removedFields);
  for (const key of next.removedFields) {
    removed.add(key);
    delete mergedChanged[key];
  }
  for (const key of Object.keys(next.changedFields)) {
    removed.delete(key);
  }
  pendingCardPatchedEvents.set(next.cardId, {
    cardId: next.cardId,
    boardId: next.boardId,
    changedFields: mergedChanged,
    removedFields: [...removed],
      ...(next.serverTs !== undefined
        ? { serverTs: next.serverTs }
        : prev.serverTs !== undefined
          ? { serverTs: prev.serverTs }
          : {}),
  });
}

async function flushPendingCardPatchedEvents(): Promise<void> {
  const queued = [...pendingCardPatchedEvents.values()];
  pendingCardPatchedEvents.clear();
  cardPatchFlushQueued = false;
  if (queued.length === 0) {
    return;
  }
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : null;
  const byBoardId = new Map<string, PendingCardPatchEvent[]>();
  for (const entry of queued) {
    const arr = byBoardId.get(entry.boardId);
    if (arr == null) {
      byBoardId.set(entry.boardId, [entry]);
    } else {
      arr.push(entry);
    }
  }
  for (const [boardId, events] of byBoardId) {
    const ids = events.map((event) => event.cardId);
    let rows: Array<Awaited<ReturnType<typeof db.cards.get>> | undefined>;
    try {
      rows = await db.cards.bulkGet(ids);
    } catch {
      continue;
    }
    const runtimeActive = runtimeActiveBoardId() === boardId;
    const runtimeCards = runtimeActive ? useBoardRuntimeStore.getState().cardsById : undefined;
    const nextCards: Array<ReturnType<typeof normalizeCardFromApi>> = [];
    const appliedCardIds: string[] = [];
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i]!;
      const existingRuntime = runtimeCards != null ? runtimeCards[event.cardId] : undefined;
      const existing = existingRuntime ?? rows[i];
      if (existing == null) {
        continue;
      }
      const patched: Record<string, unknown> = { ...existing };
      for (const [key, value] of Object.entries(event.changedFields)) {
        patched[key] = value;
      }
      for (const key of event.removedFields) {
        delete patched[key];
      }
      const normalized = normalizeCardFromApi(patched, event.cardId);
      if (isRedundantCardSocketPayload(event.cardId, normalized)) {
        continue;
      }
      nextCards.push(normalized);
      appliedCardIds.push(event.cardId);
    }
    if (nextCards.length === 0) {
      continue;
    }
    if (runtimeActive) {
      useBoardRuntimeStore.getState().upsertCards(nextCards);
    }
    try {
      await db.cards.bulkPut(nextCards);
      for (const card of nextCards) {
        emitSocketCardUpdated({ boardId, card });
      }
    } catch {
      /* Dexie bulk patch failed */
    }
    const serverTs = events[events.length - 1]?.serverTs;
    markCardEventTs(appliedCardIds, serverTs);
  }
  const elapsed =
    t0 != null && typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now() - t0
      : 0;
  logBoardRealtimePatchFlush({
    patchedCardCount: queued.length,
    queueDepth: queued.length,
    flushMs: elapsed,
  });
}

function queueCardPatchedEvent(event: PendingCardPatchEvent): void {
  coalesceCardPatchedEvent(event);
  if (cardPatchFlushQueued) {
    return;
  }
  cardPatchFlushQueued = true;
  queueMicrotask(() => {
    void flushPendingCardPatchedEvents();
  });
}

async function getLocalUserId(): Promise<string> {
  if (localUserIdCache != null) {
    return localUserIdCache;
  }
  if (localUserIdLoadPromise != null) {
    return localUserIdLoadPromise;
  }
  localUserIdLoadPromise = db.users
    .toCollection()
    .first()
    .then((me) => {
      const uid = me?.id?.trim() ?? '';
      localUserIdCache = uid;
      return uid;
    })
    .finally(() => {
      localUserIdLoadPromise = null;
    });
  return localUserIdLoadPromise;
}

function onSocketIoReconnect(): void {
  const s = reconnectListenerSocket;
  if (s != null && globalRealtimeHandlerRefCount > 0) {
    clearCardSocketDedupeCache();
    lastCardEventTsById.clear();
    lastListOrderEventTsByKey.clear();
    detachGlobalRealtimeHandlers(s);
    attachGlobalRealtimeHandlers(s);
  }
}

function attachGlobalRealtimeHandlers(socket: Socket): void {
  socket.on('workspace:created', (data: { workspaceId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const workspace = transformWorkspace(data.data);
        void getLocalUserId().then((uid) => {
          void db.workspaces.put(workspace).then(() => {
            applyWorkspaceRoomMembership(
              workspace.id,
              canJoinWorkspaceRoomForLocalUser(workspace, uid),
            );
            emitSocketWorkspaceCreated({ workspaceId: data.workspaceId, workspace });
          });
        });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on('workspace:updated', (data: { workspaceId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const workspace = transformWorkspace(data.data);
        void getLocalUserId().then((uid) => {
          void db.workspaces.put(workspace).then(() => {
            applyWorkspaceRoomMembership(
              workspace.id,
              canJoinWorkspaceRoomForLocalUser(workspace, uid),
            );
            emitSocketWorkspaceUpdated({ workspaceId: data.workspaceId, workspace });
          });
        });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on('workspace:deleted', (data: { workspaceId: string }) => {
    deferSocketWork(() => {
      applyWorkspaceRoomMembership(data.workspaceId, false);
      void db.workspaces.delete(data.workspaceId).then(() => {
        emitSocketWorkspaceDeleted({ workspaceId: data.workspaceId });
      });
    });
  });

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

  socket.on('lists:reordered', (data: { boardId: string; orderedListIds: string[] }) => {
    deferSocketWork(() => {
      if (runtimeActiveBoardId() === data.boardId) {
        useBoardRuntimeStore.getState().applyListsPositionsFromOrder(data.orderedListIds);
      }
      void db.lists
        .where('boardId')
        .equals(data.boardId)
        .toArray()
        .then(async (lists) => {
          const nextLists = lists.map((list) => {
            const idx = data.orderedListIds.indexOf(list.id);
            return idx >= 0 ? { ...list, position: idx } : list;
          });
          if (nextLists.length > 0) {
            await db.lists.bulkPut(nextLists);
          }
        })
        .catch(() => {
          /* Dexie list reorder failed */
        });
    });
  });

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
              nextCards.map((c) => c.id),
              data.serverTs,
            );
            for (const c of nextCards) {
              if (!isRedundantCardSocketPayload(c.id, c)) {
                emitSocketCardUpdated({ boardId: data.boardId, card: c });
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
              rawPos.every((p) => typeof p === 'number' && Number.isFinite(p));
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
                nextCards.map((c) => c.id),
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
                for (const c of nextCards) {
                  emitSocketCardUpdated({ boardId: data.boardId, card: c });
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
            const lid = String(data.label.id);
            if (existing.labels.some((l) => String(l.id) === lid)) {
              return;
            }
            const next = {
              ...existing,
              labels: [...existing.labels, { ...data.label, id: lid }],
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
            const rm = String(data.labelId);
            const next = {
              ...existing,
              labels: existing.labels.filter((l) => String(l.id) !== rm),
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

  const buildInvitesChangedPayload = (data: {
    workspaceId?: string;
    boardId?: string;
  }): SocketInvitesChangedPayload =>
    ({
      ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
      ...(data.boardId !== undefined ? { boardId: data.boardId } : {}),
    }) as SocketInvitesChangedPayload;

  socket.on('invite:created', (data: { workspaceId?: string; boardId?: string }) => {
    deferSocketWork(() => {
      emitSocketInvitesChanged(buildInvitesChangedPayload(data));
    });
  });
  socket.on('invite:updated', (data: { workspaceId?: string; boardId?: string }) => {
    deferSocketWork(() => {
      emitSocketInvitesChanged(buildInvitesChangedPayload(data));
    });
  });
  socket.on('invite:deleted', (data: { workspaceId?: string; boardId?: string }) => {
    deferSocketWork(() => {
      emitSocketInvitesChanged(buildInvitesChangedPayload(data));
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
        .modify((l) => {
          if (trimmed === '') {
            delete l.color;
          } else {
            l.color = trimmed;
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
        const q =
          scopedListId != null
            ? db.cards.where('listId').equals(scopedListId)
            : db.cards.where('boardId').equals(data.boardId);
        void q
          .modify((c) => {
            if (trimmed === '') {
              delete c.color;
            } else {
              c.color = trimmed;
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

  socket.on('connect', onSocketConnectResyncWorkspaceRooms);
  if (socket.connected) {
    void resyncWorkspaceSocketRoomsFromDexie();
  }
}

function detachGlobalRealtimeHandlers(socket: Socket): void {
  socket.off('connect', onSocketConnectResyncWorkspaceRooms);
  socket.off('workspace:created');
  socket.off('workspace:updated');
  socket.off('workspace:deleted');
  socket.off('board:created');
  socket.off('board:updated');
  socket.off('board:deleted');
  socket.off('boards:positionsSynced');
  socket.off('list:created');
  socket.off('list:updated');
  socket.off('list:deleted');
  socket.off('lists:reordered');
  socket.off('card:created');
  socket.off('card:updated');
  socket.off('card:patched');
  socket.off('card:deleted');
  socket.off('cards:reordered');
  socket.off('cards:positions-batch-updated');
  socket.off('labels:removedBulk');
  socket.off('label:created');
  socket.off('label:updated');
  socket.off('label:deleted');
  socket.off('label:assigned');
  socket.off('label:removed');
  socket.off('invite:created');
  socket.off('invite:updated');
  socket.off('invite:deleted');
  socket.off('lists:bulk-color-updated');
  socket.off('cards:bulk-color-updated');
  socket.off('card:duplicated');
}

export function useSocket(boardId?: string) {
  useEffect(() => {
    const tryAttach = (): (() => void) | undefined => {
      const socket = socketClient.getSocket();
      if (!socket) {
        return undefined;
      }
      globalRealtimeHandlerRefCount += 1;
      if (globalRealtimeHandlerRefCount === 1) {
        attachGlobalRealtimeHandlers(socket);
        reconnectListenerSocket = socket;
        socket.io.on('reconnect', onSocketIoReconnect);
      }
      return () => {
        globalRealtimeHandlerRefCount -= 1;
        if (globalRealtimeHandlerRefCount === 0) {
          socket.io.off('reconnect', onSocketIoReconnect);
          reconnectListenerSocket = null;
          detachGlobalRealtimeHandlers(socket);
        }
      };
    };

    let cleanup = tryAttach();
    const onConnect = (): void => {
      if (cleanup != null) {
        return;
      }
      cleanup = tryAttach();
    };
    const socket = socketClient.getSocket();
    socket?.on('connect', onConnect);

    return () => {
      socket?.off('connect', onConnect);
      if (cleanup != null) {
        cleanup();
        cleanup = undefined;
      }
    };
  }, []);

  const joinBoard = useCallback((id: string) => {
    socketClient.joinBoard(id);
  }, []);

  const leaveBoard = useCallback((id: string) => {
    socketClient.leaveBoard(id);
  }, []);

  useEffect(() => {
    if (boardId) {
      joinBoard(boardId);
      return () => {
        leaveBoard(boardId);
      };
    }
    return undefined;
  }, [boardId, joinBoard, leaveBoard]);

  return {
    joinBoard,
    leaveBoard,
  };
}
