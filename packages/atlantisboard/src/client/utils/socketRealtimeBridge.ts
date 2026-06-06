import type { BoardDB, CardDB, ListDB, WorkspaceDB } from '../store/database.js';

/**
 * Fan-out for socket-driven updates after a single Dexie write path in useSocket.
 * Subscribers should wrap React updates in startTransition where appropriate.
 */

export interface SocketCardUpdatedPayload {
  readonly boardId: string;
  readonly card: CardDB;
}

export interface SocketCardDeletedPayload {
  readonly boardId: string;
  readonly cardId: string;
}

export interface SocketBoardUpdatedPayload {
  readonly boardId: string;
  readonly board: BoardDB;
}

export interface SocketBoardCreatedPayload {
  readonly boardId: string;
  readonly board: BoardDB;
}

export interface SocketBoardDeletedPayload {
  readonly boardId: string;
}

export interface SocketWorkspaceUpdatedPayload {
  readonly workspaceId: string;
  readonly workspace: WorkspaceDB;
}

export interface SocketWorkspaceCreatedPayload {
  readonly workspaceId: string;
  readonly workspace: WorkspaceDB;
}

export interface SocketWorkspaceDeletedPayload {
  readonly workspaceId: string;
}

export interface SocketListCreatedPayload {
  readonly boardId: string;
  readonly list: ListDB;
}

export interface SocketListUpdatedPayload {
  readonly boardId: string;
  readonly list: ListDB;
}

export interface SocketListDeletedPayload {
  readonly boardId: string;
  readonly listId: string;
}

export interface SocketBoardLabelsChangedPayload {
  readonly boardId: string;
}

export interface SocketInvitesChangedPayload {
  readonly workspaceId?: string;
  readonly boardId?: string;
}

/** Fired after IndexedDB is patched for a server-driven `cards:bulk-color-updated` event. */
export interface SocketCardsBulkColorPayload {
  readonly boardId: string;
}

/** Fired after IndexedDB is patched for a server-driven `lists:bulk-color-updated` event. */
export interface SocketListsBulkColorPayload {
  readonly boardId: string;
}

type Unsubscribe = () => void;

const cardUpdatedSubs = new Set<(p: SocketCardUpdatedPayload) => void>();
const cardDeletedSubs = new Set<(p: SocketCardDeletedPayload) => void>();
const boardUpdatedSubs = new Set<(p: SocketBoardUpdatedPayload) => void>();
const boardCreatedSubs = new Set<(p: SocketBoardCreatedPayload) => void>();
const boardDeletedSubs = new Set<(p: SocketBoardDeletedPayload) => void>();
const workspaceUpdatedSubs = new Set<(p: SocketWorkspaceUpdatedPayload) => void>();
const workspaceCreatedSubs = new Set<(p: SocketWorkspaceCreatedPayload) => void>();
const workspaceDeletedSubs = new Set<(p: SocketWorkspaceDeletedPayload) => void>();
const listCreatedSubs = new Set<(p: SocketListCreatedPayload) => void>();
const listUpdatedSubs = new Set<(p: SocketListUpdatedPayload) => void>();
const listDeletedSubs = new Set<(p: SocketListDeletedPayload) => void>();
const boardLabelsChangedSubs = new Set<(p: SocketBoardLabelsChangedPayload) => void>();
const invitesChangedSubs = new Set<(p: SocketInvitesChangedPayload) => void>();
const cardsBulkColorSubs = new Set<(p: SocketCardsBulkColorPayload) => void>();
const listsBulkColorSubs = new Set<(p: SocketListsBulkColorPayload) => void>();

export function subscribeSocketCardUpdated(fn: (p: SocketCardUpdatedPayload) => void): Unsubscribe {
  cardUpdatedSubs.add(fn);
  return () => {
    cardUpdatedSubs.delete(fn);
  };
}

export function emitSocketCardUpdated(p: SocketCardUpdatedPayload): void {
  for (const fn of cardUpdatedSubs) {
    fn(p);
  }
}

export interface SocketCardsUpdatedBatchPayload {
  readonly boardId: string;
  readonly cards: readonly CardDB[];
}

/** Fan-out after bulk Dexie/runtime card writes (reorder, positions batch, patch flush). */
export function emitSocketCardsUpdatedBatch(p: SocketCardsUpdatedBatchPayload): void {
  if (p.cards.length === 0) {
    return;
  }
  for (const card of p.cards) {
    const payload: SocketCardUpdatedPayload = { boardId: p.boardId, card };
    for (const fn of cardUpdatedSubs) {
      fn(payload);
    }
  }
}

export function subscribeSocketCardDeleted(fn: (p: SocketCardDeletedPayload) => void): Unsubscribe {
  cardDeletedSubs.add(fn);
  return () => {
    cardDeletedSubs.delete(fn);
  };
}

export function emitSocketCardDeleted(p: SocketCardDeletedPayload): void {
  for (const fn of cardDeletedSubs) {
    fn(p);
  }
}

export function subscribeSocketBoardUpdated(fn: (p: SocketBoardUpdatedPayload) => void): Unsubscribe {
  boardUpdatedSubs.add(fn);
  return () => {
    boardUpdatedSubs.delete(fn);
  };
}

export function emitSocketBoardUpdated(p: SocketBoardUpdatedPayload): void {
  for (const fn of boardUpdatedSubs) {
    fn(p);
  }
}

export function subscribeSocketBoardCreated(fn: (p: SocketBoardCreatedPayload) => void): Unsubscribe {
  boardCreatedSubs.add(fn);
  return () => {
    boardCreatedSubs.delete(fn);
  };
}

export function emitSocketBoardCreated(p: SocketBoardCreatedPayload): void {
  for (const fn of boardCreatedSubs) {
    fn(p);
  }
}

export function subscribeSocketBoardDeleted(fn: (p: SocketBoardDeletedPayload) => void): Unsubscribe {
  boardDeletedSubs.add(fn);
  return () => {
    boardDeletedSubs.delete(fn);
  };
}

export function emitSocketBoardDeleted(p: SocketBoardDeletedPayload): void {
  for (const fn of boardDeletedSubs) {
    fn(p);
  }
}

export function subscribeSocketWorkspaceUpdated(
  fn: (p: SocketWorkspaceUpdatedPayload) => void,
): Unsubscribe {
  workspaceUpdatedSubs.add(fn);
  return () => {
    workspaceUpdatedSubs.delete(fn);
  };
}

export function emitSocketWorkspaceUpdated(p: SocketWorkspaceUpdatedPayload): void {
  for (const fn of workspaceUpdatedSubs) {
    fn(p);
  }
}

export function subscribeSocketWorkspaceCreated(
  fn: (p: SocketWorkspaceCreatedPayload) => void,
): Unsubscribe {
  workspaceCreatedSubs.add(fn);
  return () => {
    workspaceCreatedSubs.delete(fn);
  };
}

export function emitSocketWorkspaceCreated(p: SocketWorkspaceCreatedPayload): void {
  for (const fn of workspaceCreatedSubs) {
    fn(p);
  }
}

export function subscribeSocketWorkspaceDeleted(
  fn: (p: SocketWorkspaceDeletedPayload) => void,
): Unsubscribe {
  workspaceDeletedSubs.add(fn);
  return () => {
    workspaceDeletedSubs.delete(fn);
  };
}

export function emitSocketWorkspaceDeleted(p: SocketWorkspaceDeletedPayload): void {
  for (const fn of workspaceDeletedSubs) {
    fn(p);
  }
}

export function subscribeSocketListCreated(fn: (p: SocketListCreatedPayload) => void): Unsubscribe {
  listCreatedSubs.add(fn);
  return () => {
    listCreatedSubs.delete(fn);
  };
}

export function emitSocketListCreated(p: SocketListCreatedPayload): void {
  for (const fn of listCreatedSubs) {
    fn(p);
  }
}

export function subscribeSocketListUpdated(fn: (p: SocketListUpdatedPayload) => void): Unsubscribe {
  listUpdatedSubs.add(fn);
  return () => {
    listUpdatedSubs.delete(fn);
  };
}

export function emitSocketListUpdated(p: SocketListUpdatedPayload): void {
  for (const fn of listUpdatedSubs) {
    fn(p);
  }
}

export function subscribeSocketListDeleted(fn: (p: SocketListDeletedPayload) => void): Unsubscribe {
  listDeletedSubs.add(fn);
  return () => {
    listDeletedSubs.delete(fn);
  };
}

export function emitSocketListDeleted(p: SocketListDeletedPayload): void {
  for (const fn of listDeletedSubs) {
    fn(p);
  }
}

export function subscribeSocketBoardLabelsChanged(
  fn: (p: SocketBoardLabelsChangedPayload) => void,
): Unsubscribe {
  boardLabelsChangedSubs.add(fn);
  return () => {
    boardLabelsChangedSubs.delete(fn);
  };
}

export function emitSocketBoardLabelsChanged(p: SocketBoardLabelsChangedPayload): void {
  for (const fn of boardLabelsChangedSubs) {
    fn(p);
  }
}

export function subscribeSocketInvitesChanged(
  fn: (p: SocketInvitesChangedPayload) => void,
): Unsubscribe {
  invitesChangedSubs.add(fn);
  return () => {
    invitesChangedSubs.delete(fn);
  };
}

export function emitSocketInvitesChanged(p: SocketInvitesChangedPayload): void {
  for (const fn of invitesChangedSubs) {
    fn(p);
  }
}

export function subscribeSocketCardsBulkColorUpdated(
  fn: (p: SocketCardsBulkColorPayload) => void,
): Unsubscribe {
  cardsBulkColorSubs.add(fn);
  return () => {
    cardsBulkColorSubs.delete(fn);
  };
}

export function emitSocketCardsBulkColorUpdated(p: SocketCardsBulkColorPayload): void {
  for (const fn of cardsBulkColorSubs) {
    fn(p);
  }
}

export function subscribeSocketListsBulkColorUpdated(
  fn: (p: SocketListsBulkColorPayload) => void,
): Unsubscribe {
  listsBulkColorSubs.add(fn);
  return () => {
    listsBulkColorSubs.delete(fn);
  };
}

export function emitSocketListsBulkColorUpdated(p: SocketListsBulkColorPayload): void {
  for (const fn of listsBulkColorSubs) {
    fn(p);
  }
}
