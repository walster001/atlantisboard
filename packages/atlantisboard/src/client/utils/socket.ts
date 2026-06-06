import { io, type Socket } from 'socket.io-client';
import { env } from '../config/env.js';

class SocketClient {
  private socket: Socket | null = null;
  /** Last token passed to `connect` — used to avoid tearing down a handshaking socket on duplicate connect (e.g. React Strict Mode). */
  private lastAuthToken: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  connect(token: string): Socket {
    const authToken = token.trim();

    if (this.socket?.connected) {
      return this.socket;
    }

    if (
      this.socket != null &&
      !this.socket.connected &&
      this.lastAuthToken === authToken
    ) {
      return this.socket;
    }

    if (this.socket != null) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.lastAuthToken = authToken;

    const SOCKET_URL = env.SOCKET_URL || window.location.origin;

    this.socket = io(SOCKET_URL, {
      withCredentials: true,
      ...(authToken !== '' ? { auth: { token: authToken } } : {}),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
    });

    this.socket.on('connect_error', () => {
      this.reconnectAttempts++;
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.lastAuthToken = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Board room management
  joinBoard(boardId: string): void {
    if (this.socket) {
      this.socket.emit('board:join', boardId);
    }
  }

  leaveBoard(boardId: string): void {
    if (this.socket) {
      this.socket.emit('board:leave', boardId);
    }
  }

  // Workspace room management
  joinWorkspace(workspaceId: string): void {
    if (this.socket) {
      this.socket.emit('workspace:join', workspaceId);
    }
  }

  leaveWorkspace(workspaceId: string): void {
    if (this.socket) {
      this.socket.emit('workspace:leave', workspaceId);
    }
  }

  // Typing indicators
  startTyping(boardId: string, cardId?: string): void {
    if (this.socket) {
      this.socket.emit('comment:typing', { boardId, cardId });
    }
  }

  stopTyping(boardId: string, cardId?: string): void {
    if (this.socket) {
      this.socket.emit('comment:typing:stop', { boardId, cardId });
    }
  }

  // Legacy typing methods (for backwards compatibility)
  startTypingLegacy(boardId: string, cardId?: string): void {
    if (this.socket) {
      this.socket.emit('typing:start', { boardId, cardId });
    }
  }

  stopTypingLegacy(boardId: string, cardId?: string): void {
    if (this.socket) {
      this.socket.emit('typing:stop', { boardId, cardId });
    }
  }

  // Event listeners
  on(event: string, callback: (...args: unknown[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: unknown[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

export const socketClient = new SocketClient();

