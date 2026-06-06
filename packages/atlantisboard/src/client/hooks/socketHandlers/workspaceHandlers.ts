import type { Socket } from 'socket.io-client';
import { db } from '../../store/database.js';
import { transformWorkspace } from '../../utils/transform.js';
import {
  emitSocketWorkspaceCreated,
  emitSocketWorkspaceDeleted,
  emitSocketWorkspaceUpdated,
} from '../../utils/socketRealtimeBridge.js';
import {
  applyFlatFieldPatch,
  applyWorkspaceRoomMembership,
  canJoinWorkspaceRoomForLocalUser,
  deferSocketWork,
  getLocalUserId,
  onSocketConnectResyncWorkspaceRooms,
  resyncWorkspaceSocketRoomsFromDexie,
} from './state.js';

export const WORKSPACE_SOCKET_EVENTS = [
  'connect',
  'workspace:created',
  'workspace:updated',
  'workspace:patched',
  'workspace:deleted',
] as const;

export function registerWorkspaceHandlers(socket: Socket): void {
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

  socket.on(
    'workspace:patched',
    (data: {
      workspaceId: string;
      changedFields: Record<string, unknown>;
      removedFields: string[];
      serverTs?: number;
      version?: number;
    }) => {
      deferSocketWork(() => {
        void db.workspaces.get(data.workspaceId).then((existing) => {
          if (existing == null) {
            return;
          }
          const patched = applyFlatFieldPatch(existing, data.changedFields, data.removedFields);
          void getLocalUserId().then((uid) => {
            void db.workspaces.put(patched).then(() => {
              applyWorkspaceRoomMembership(
                patched.id,
                canJoinWorkspaceRoomForLocalUser(patched, uid),
              );
              emitSocketWorkspaceUpdated({ workspaceId: data.workspaceId, workspace: patched });
            });
          });
        });
      });
    },
  );

  socket.on('workspace:deleted', (data: { workspaceId: string }) => {
    deferSocketWork(() => {
      applyWorkspaceRoomMembership(data.workspaceId, false);
      void db.workspaces.delete(data.workspaceId).then(() => {
        emitSocketWorkspaceDeleted({ workspaceId: data.workspaceId });
      });
    });
  });

  socket.on('connect', onSocketConnectResyncWorkspaceRooms);
  if (socket.connected) {
    void resyncWorkspaceSocketRoomsFromDexie();
  }
}
