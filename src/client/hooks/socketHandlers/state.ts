import { capMapSize } from '../../../shared/utils/capMapSize.js';
import { db, type CardDB, type WorkspaceDB } from '../../store/database.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import {
  emitSocketCardUpdated,
  type SocketInvitesChangedPayload,
} from '../../utils/socketRealtimeBridge.js';
import {
  clearCardSocketDedupeCache,
  isRedundantCardSocketPayload,
} from '../../utils/cardSocketDedupe.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { socketClient } from '../../utils/socket.js';
import { logBoardRealtimePatchFlush } from '../../perf/boardPerf.js';

export function runtimeActiveBoardId(): string | null {
  return useBoardRuntimeStore.getState().activeBoardId;
}

/** Yields so the WebSocket/engine.io message callback returns before transform/IDB work. */
export function deferSocketWork(fn: () => void): void {
  queueMicrotask(fn);
}

const cardSocketApplyChains = new Map<string, Promise<unknown>>();
const MAX_CARD_SOCKET_APPLY_CHAINS = 512;
const MAX_CARD_EVENT_TS_ENTRIES = 2048;
const MAX_LIST_ORDER_EVENT_TS_ENTRIES = 512;

/**
 * Serialize async Dexie/runtime updates per card so overlapping `card:updated` handlers
 * do not all read the same stale row before prior `put`s complete (lost checklist toggles, etc.).
 */
export function enqueueCardSocketApply<T = void>(cardId: string, task: () => Promise<T>): Promise<T> {
  const id = String(cardId).trim();
  if (id === '') {
    return task().catch(() => undefined as T);
  }
  const prev = cardSocketApplyChains.get(id) ?? Promise.resolve();
  const next: Promise<T> = prev.catch(() => undefined).then(() =>
    task().catch(() => undefined as T),
  ) as Promise<T>;
  cardSocketApplyChains.set(id, next);
  capMapSize(cardSocketApplyChains, MAX_CARD_SOCKET_APPLY_CHAINS);
  void next.finally(() => {
    if (cardSocketApplyChains.get(id) === next) {
      cardSocketApplyChains.delete(id);
    }
  });
  return next;
}

export function applyFlatFieldPatch<T extends object>(
  current: T,
  changedFields: Readonly<Record<string, unknown>>,
  removedFields: readonly string[],
): T {
  const patched: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(changedFields)) {
    patched[key] = value;
  }
  for (const key of removedFields) {
    delete patched[key];
  }
  return patched as T;
}

let localUserIdCache: string | null = null;
let localUserIdLoadPromise: Promise<string> | null = null;

export function resetLocalUserIdCache(): void {
  localUserIdCache = null;
  localUserIdLoadPromise = null;
}

export async function getLocalUserId(): Promise<string> {
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

/**
 * Join `workspace:*` only when this device’s user is an owner/member and not board-scoped-only on
 * home; otherwise leave. Prevents ex-members from receiving `board:updated` fan-out that re-adds
 * tiles after `board:deleted` / workspace removal.
 */
export function canJoinWorkspaceRoomForLocalUser(workspace: WorkspaceDB, localUserId: string): boolean {
  const uid = localUserId.trim();
  if (uid === '') {
    return false;
  }
  const boardScoped = workspace.boardScopedHomeOnly === true;
  const inWorkspace =
    workspace.ownerId === uid || workspace.members.some((member) => member.userId === uid);
  return !boardScoped && inWorkspace;
}

const joinedWorkspaceRoomIds = new Set<string>();
let resyncWorkspaceRoomsInFlight: Promise<void> | null = null;
let resyncWorkspaceRoomsQueued = false;

export function applyWorkspaceRoomMembership(workspaceId: string, shouldJoin: boolean): void {
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

export function resetJoinedWorkspaceRooms(): void {
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

export function onSocketConnectResyncWorkspaceRooms(): void {
  resetJoinedWorkspaceRooms();
  void resyncWorkspaceSocketRoomsFromDexie();
}

const lastCardEventTsById = new Map<string, number>();
const lastListOrderEventTsByKey = new Map<string, number>();

export function shouldApplyCardEvent(cardId: string, serverTs: unknown): boolean {
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
  capMapSize(lastCardEventTsById, MAX_CARD_EVENT_TS_ENTRIES);
  return true;
}

export function shouldApplyListOrderEvent(boardId: string, listId: string, serverTs: unknown): boolean {
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
  capMapSize(lastListOrderEventTsByKey, MAX_LIST_ORDER_EVENT_TS_ENTRIES);
  return true;
}

export function markCardEventTs(cardIds: readonly string[], serverTs: unknown): void {
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

export function resetRealtimeCachesForReconnect(): void {
  resetLocalUserIdCache();
  clearCardSocketDedupeCache();
  lastCardEventTsById.clear();
  lastListOrderEventTsByKey.clear();
  cardSocketApplyChains.clear();
}

export function buildInvitesChangedPayload(data: {
  workspaceId?: string;
  boardId?: string;
}): SocketInvitesChangedPayload {
  return {
    ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
    ...(data.boardId !== undefined ? { boardId: data.boardId } : {}),
  };
}

type PendingCardPatchEvent = {
  readonly cardId: string;
  readonly boardId: string;
  readonly changedFields: Readonly<Record<string, unknown>>;
  readonly removedFields: readonly string[];
  readonly serverTs?: number;
};

/** Apply a partial card patch to an existing card row; returns null when redundant or missing. */
export function applyCardPatch(
  existing: CardDB | undefined,
  cardId: string,
  changedFields: Readonly<Record<string, unknown>>,
  removedFields: readonly string[],
): ReturnType<typeof normalizeCardFromApi> | null {
  if (existing == null) {
    return null;
  }
  const patched: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(changedFields)) {
    if (key === 'attachments' && !Array.isArray(value)) {
      continue;
    }
    patched[key] = value;
  }
  for (const key of removedFields) {
    delete patched[key];
  }
  const normalized = normalizeCardFromApi(patched, cardId, {
    listId: existing.listId,
    boardId: existing.boardId,
  });
  if (isRedundantCardSocketPayload(cardId, normalized)) {
    return null;
  }
  return normalized;
}

const pendingCardPatchedEvents = new Map<string, PendingCardPatchEvent>();
let cardPatchFlushQueued = false;

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
    const runtimeActive = runtimeActiveBoardId() === boardId;
    let resolved: Array<ReturnType<typeof normalizeCardFromApi> | null | undefined>;
    try {
      resolved = await Promise.all(
        events.map((event) =>
          enqueueCardSocketApply(event.cardId, async () => {
            const existingDexie = await db.cards.get(event.cardId);
            const existingRuntime =
              runtimeActive ? useBoardRuntimeStore.getState().cardsById[event.cardId] : undefined;
            const existing = existingRuntime ?? existingDexie;
            return applyCardPatch(existing, event.cardId, event.changedFields, event.removedFields);
          }),
        ),
      );
    } catch {
      continue;
    }
    const nextCards = resolved.filter(
      (c): c is ReturnType<typeof normalizeCardFromApi> => c != null,
    );
    const appliedCardIds = nextCards.map((c) => c.id);
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

export function queueCardPatchedEvent(event: PendingCardPatchEvent): void {
  coalesceCardPatchedEvent(event);
  if (cardPatchFlushQueued) {
    return;
  }
  cardPatchFlushQueued = true;
  queueMicrotask(() => {
    void flushPendingCardPatchedEvents();
  });
}
