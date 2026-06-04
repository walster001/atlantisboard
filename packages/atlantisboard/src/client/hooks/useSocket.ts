import { useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { socketClient } from '../utils/socket.js';
import {
  attachGlobalRealtimeHandlers,
  detachGlobalRealtimeHandlers,
} from './socketHandlers/registerHandlers.js';
import {
  resetRealtimeCachesForReconnect,
  resyncWorkspaceSocketRoomsFromDexie,
} from './socketHandlers/state.js';
import { resetListBulkPositionRevisions } from './socketHandlers/listHandlers.js';

/** Multiple routes mount `useSocket`; handlers must attach exactly once per socket. */
let globalRealtimeHandlerRefCount = 0;
let reconnectListenerSocket: Socket | null = null;

function onSocketIoReconnect(): void {
  const socket = reconnectListenerSocket;
  if (socket != null && globalRealtimeHandlerRefCount > 0) {
    resetRealtimeCachesForReconnect();
    resetListBulkPositionRevisions();
    detachGlobalRealtimeHandlers(socket);
    attachGlobalRealtimeHandlers(socket);
  }
}

export { resyncWorkspaceSocketRoomsFromDexie };

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
