import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

/**
 * Set the Socket.io server instance
 * Called from src/server/sockets/index.ts after initialization
 */
export function setSocketIOInstance(io: SocketIOServer): void {
  ioInstance = io;
}

/**
 * Get the Socket.io server instance
 * Use this in routes/services to emit events
 */
export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

/**
 * Emit event to a board room
 */
export function emitToBoard(boardId: string, event: string, data: unknown): void {
  if (ioInstance) {
    ioInstance.to(`board:${boardId}`).emit(event, data);
  }
}

/**
 * Emit event to a workspace room
 */
export function emitToWorkspace(workspaceId: string, event: string, data: unknown): void {
  if (ioInstance) {
    ioInstance.to(`workspace:${workspaceId}`).emit(event, data);
  }
}

/**
 * Emit event to a user room (for notifications)
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
}

/**
 * Emit event to all connected clients
 */
export function emitToAll(event: string, data: unknown): void {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}

