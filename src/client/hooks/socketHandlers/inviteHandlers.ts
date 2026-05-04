import type { Socket } from 'socket.io-client';
import { emitSocketInvitesChanged } from '../../utils/socketRealtimeBridge.js';
import { buildInvitesChangedPayload, deferSocketWork } from './state.js';

export const INVITE_SOCKET_EVENTS = [
  'invite:created',
  'invite:updated',
  'invite:patched',
  'invite:deleted',
] as const;

export function registerInviteHandlers(socket: Socket): void {
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

  socket.on('invite:patched', (data: { workspaceId?: string; boardId?: string }) => {
    deferSocketWork(() => {
      emitSocketInvitesChanged(buildInvitesChangedPayload(data));
    });
  });
}
