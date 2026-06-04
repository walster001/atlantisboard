import type { Socket } from 'socket.io-client';
import { registerWorkspaceHandlers, WORKSPACE_SOCKET_EVENTS } from './workspaceHandlers.js';
import { registerBoardHandlers, BOARD_SOCKET_EVENTS } from './boardHandlers.js';
import { registerListHandlers, LIST_SOCKET_EVENTS } from './listHandlers.js';
import { registerCardHandlers, CARD_SOCKET_EVENTS } from './cardHandlers.js';
import { registerLabelHandlers, LABEL_SOCKET_EVENTS } from './labelHandlers.js';
import { registerInviteHandlers, INVITE_SOCKET_EVENTS } from './inviteHandlers.js';

export const GLOBAL_REALTIME_SOCKET_EVENTS = [
  ...WORKSPACE_SOCKET_EVENTS,
  ...BOARD_SOCKET_EVENTS,
  ...LIST_SOCKET_EVENTS,
  ...CARD_SOCKET_EVENTS,
  ...LABEL_SOCKET_EVENTS,
  ...INVITE_SOCKET_EVENTS,
] as const;

export function attachGlobalRealtimeHandlers(socket: Socket): void {
  registerWorkspaceHandlers(socket);
  registerBoardHandlers(socket);
  registerListHandlers(socket);
  registerCardHandlers(socket);
  registerLabelHandlers(socket);
  registerInviteHandlers(socket);
}

export function detachGlobalRealtimeHandlers(socket: Socket): void {
  for (const eventName of GLOBAL_REALTIME_SOCKET_EVENTS) {
    socket.off(eventName);
  }
}
