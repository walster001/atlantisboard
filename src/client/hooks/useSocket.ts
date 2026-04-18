import { useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { socketClient } from '../utils/socket.js';
import { db, type WorkspaceDB } from '../store/database.js';
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
  type SocketInvitesChangedPayload,
} from '../utils/socketRealtimeBridge.js';
import {
  clearCardSocketDedupeCache,
  forgetCardSocketDedupe,
  isRedundantCardSocketPayload,
} from '../utils/cardSocketDedupe.js';

/** Yields so the WebSocket/engine.io message callback returns before transform/IDB work. */
function deferSocketWork(fn: () => void): void {
  queueMicrotask(fn);
}

/**
 * Join `workspace:*` only when this device’s user is an owner/member and not board-scoped-only on
 * home; otherwise leave. Prevents ex-members from receiving `board:updated` fan-out that re-adds tiles
 * after `board:deleted` / workspace removal.
 */
function syncWorkspaceSocketRoomForLocalUser(workspace: WorkspaceDB): void {
  void db.users.toCollection().first().then((me) => {
    const uid = me?.id?.trim() ?? '';
    if (uid === '') {
      return;
    }
    const boardScoped = workspace.boardScopedHomeOnly === true;
    const inWorkspace =
      workspace.ownerId === uid || workspace.members.some((m) => m.userId === uid);
    if (!boardScoped && inWorkspace) {
      socketClient.joinWorkspace(workspace.id);
    } else {
      socketClient.leaveWorkspace(workspace.id);
    }
  });
}

/** Multiple routes mount `useSocket`; handlers must attach exactly once per socket. */
let globalRealtimeHandlerRefCount = 0;
let reconnectListenerSocket: Socket | null = null;

function onSocketIoReconnect(): void {
  const s = reconnectListenerSocket;
  if (s != null && globalRealtimeHandlerRefCount > 0) {
    clearCardSocketDedupeCache();
    detachGlobalRealtimeHandlers(s);
    attachGlobalRealtimeHandlers(s);
  }
}

function attachGlobalRealtimeHandlers(socket: Socket): void {
  socket.on('workspace:created', (data: { workspaceId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const workspace = transformWorkspace(data.data);
        void db.workspaces.put(workspace).then(() => {
          syncWorkspaceSocketRoomForLocalUser(workspace);
          emitSocketWorkspaceCreated({ workspaceId: data.workspaceId, workspace });
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
        void db.workspaces.put(workspace).then(() => {
          syncWorkspaceSocketRoomForLocalUser(workspace);
          emitSocketWorkspaceUpdated({ workspaceId: data.workspaceId, workspace });
        });
      } catch {
        /* invalid payload */
      }
    });
  });

  socket.on('workspace:deleted', (data: { workspaceId: string }) => {
    deferSocketWork(() => {
      socketClient.leaveWorkspace(data.workspaceId);
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
            for (let i = 0; i < order.length; i++) {
              const id = order[i];
              if (id === '') {
                continue;
              }
              const existing = await db.boards.get(id);
              if (existing == null) {
                continue;
              }
              // Stale `boards:positionsSynced` can still list a board after it moved to another row.
              // Never re-assign workspace from this event; only bump position for rows we already match.
              if (rowKey(existing.workspaceId) !== wid) {
                continue;
              }
              await db.boards.put({
                ...existing,
                position: i,
              });
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

  socket.on('card:created', (data: { cardId: string; boardId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const card = normalizeCardFromApi(data.data, data.cardId);
        void db.cards.get(data.cardId).then((existing) => {
          const merged = mergeDexieCardIfSnapshot(data.data, existing ?? undefined, card);
          if (isRedundantCardSocketPayload(data.cardId, merged)) {
            return;
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

  socket.on('card:updated', (data: { cardId: string; boardId: string; data: unknown }) => {
    deferSocketWork(() => {
      try {
        const card = normalizeCardFromApi(data.data, data.cardId);
        void db.cards
          .get(data.cardId)
          .then((existing) => {
            const merged = mergeDexieCardIfSnapshot(data.data, existing ?? undefined, card);
            if (isRedundantCardSocketPayload(data.cardId, merged)) {
              return;
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
    }) => {
      deferSocketWork(() => {
        void db.cards
          .get(data.cardId)
          .then((existing) => {
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
    (data: { boardId: string; listId: string; orderedCardIds: string[] }) => {
      deferSocketWork(() => {
        void db.cards
          .where('listId')
          .equals(data.listId)
          .toArray()
          .then(async (cards) => {
            const nextCards = cards.map((card) => {
              const idx = data.orderedCardIds.indexOf(card.id);
              return idx >= 0 ? { ...card, position: idx } : card;
            });
            if (nextCards.length > 0) {
              await db.cards.bulkPut(nextCards);
              for (const c of nextCards) {
                if (!isRedundantCardSocketPayload(c.id, c)) {
                  emitSocketCardUpdated({ boardId: data.boardId, card: c });
                }
              }
            }
          })
          .catch(() => {
            /* Dexie update failed */
          });
      });
    },
  );

  socket.on('card:deleted', (data: { cardId: string; boardId: string }) => {
    deferSocketWork(() => {
      forgetCardSocketDedupe(data.cardId);
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
          .then((existing) => {
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
          .then((existing) => {
            if (!existing) {
              return;
            }
            const rm = String(data.labelId);
            const next = {
              ...existing,
              labels: existing.labels.filter((l) => String(l.id) !== rm),
            };
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

  socket.on(
    'card:duplicated',
    (data: { duplicatedCardId: string; boardId: string; data: unknown }) => {
      deferSocketWork(() => {
        try {
          const card = normalizeCardFromApi(data.data, data.duplicatedCardId);
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

function detachGlobalRealtimeHandlers(socket: Socket): void {
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
  socket.off('labels:removedBulk');
  socket.off('label:created');
  socket.off('label:updated');
  socket.off('label:deleted');
  socket.off('label:assigned');
  socket.off('label:removed');
  socket.off('invite:created');
  socket.off('invite:updated');
  socket.off('invite:deleted');
  socket.off('card:duplicated');
}

export function useSocket(boardId?: string) {
  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) {
      return undefined;
    }
    let cancelled = false;
    void db.workspaces.toArray().then((workspaces) => {
      if (cancelled) {
        return;
      }
      for (const workspace of workspaces) {
        syncWorkspaceSocketRoomForLocalUser(workspace);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
