/**
 * Socket.IO Client - WebSocket client for real-time database changes
 * 
 * Provides a Socket.IO interface for WebSocket connections.
 */

import { io, Socket } from 'socket.io-client';

const isDev = import.meta.env.DEV;

interface DatabaseChangePayload {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  payload: {
    new?: Record<string, unknown> | null;
    old?: Record<string, unknown> | null;
    entityType?: 'board' | 'column' | 'card' | 'cardDetail' | 'member' | 'workspace';
    entityId?: string;
    parentId?: string;
    workspaceId?: string;
    [key: string]: unknown;
  };
}

type DatabaseChangeHandler = (payload: DatabaseChangePayload) => void;

class SocketIOClient {
  private socket: Socket | null = null;
  private accessToken: string | null = null;
  private wsUrl: string;
  private channels: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private databaseChangeHandlers: Set<DatabaseChangeHandler> = new Set();

  constructor(baseUrl: string) {
    // Convert HTTP URL to WebSocket URL
    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = baseUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
    this.wsUrl = `${wsProtocol}://${wsHost}`;
  }

  setAuth(token: string | null) {
    // Only reconnect if token actually changed
    if (this.accessToken === token) {
      return; // Token unchanged, no need to reconnect
    }
    
    this.accessToken = token;
    
    // If Socket.IO is connected, reconnect with new token
    if (this.socket?.connected) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Ensure connection is established (doesn't reconnect if already connected)
   */
  ensureConnected(): void {
    if (this.socket?.connected) {
      return; // Already connected
    }
    
    if (!this.accessToken) {
      return; // No token, cannot connect
    }
    
    this.connect();
  }

  private connect(): void {
    if (this.socket?.connected) {
      return; // Already connected
    }

    if (!this.accessToken) {
      console.warn('[Socket.IO] No access token, cannot connect');
      return;
    }

    try {
      this.socket = io(this.wsUrl, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: {
          token: this.accessToken,
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: this.maxReconnectAttempts,
      });

      this.setupSocketHandlers();
    } catch (error) {
      console.error('[Socket.IO] Connection error:', error);
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      if (isDev) console.log('[Socket.IO] Connected');
      this.reconnectAttempts = 0;
      
      // Restore previous subscriptions
      this.channels.forEach(channel => {
        this.subscribe(channel);
      });
    });

    this.socket.on('connected', (data: { message?: string }) => {
      if (isDev) console.log('[Socket.IO] Connection confirmed:', data.message);
    });

    this.socket.on('subscribed', (data: { channel: string }) => {
      if (isDev) console.log('[Socket.IO] Subscribed to channel:', data.channel);
      this.channels.add(data.channel);
    });

    this.socket.on('unsubscribed', (data: { channel: string }) => {
      if (isDev) console.log('[Socket.IO] Unsubscribed from channel:', data.channel);
      this.channels.delete(data.channel);
    });

    this.socket.on('database_change', (payload: DatabaseChangePayload) => {
      // Notify all registered handlers
      this.databaseChangeHandlers.forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          console.error('[Socket.IO] Error in database change handler:', error);
        }
      });
    });

    this.socket.on('custom_event', (data: { type: string; payload: Record<string, unknown> }) => {
      // Handle custom events if needed
      if (isDev) console.log('[Socket.IO] Custom event:', data.type, data.payload);
    });

    this.socket.on('error', (error: { message?: string }) => {
      console.error('[Socket.IO] Error:', error.message || error);
    });

    this.socket.on('disconnect', (reason: string) => {
      if (isDev) console.log('[Socket.IO] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('[Socket.IO] Connection error:', error.message);
      this.reconnectAttempts++;
    });
  }

  /**
   * Subscribe to a channel (room)
   */
  subscribe(channel: string): void {
    if (!this.socket?.connected) {
      // Queue subscription for when connection is established
      this.channels.add(channel);
      this.ensureConnected();
      return;
    }

    this.socket.emit('subscribe', { channel });
    this.channels.add(channel);
  }

  /**
   * Unsubscribe from a channel (room)
   */
  unsubscribe(channel: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe', { channel });
    }
    this.channels.delete(channel);
  }

  /**
   * Register a handler for database change events
   */
  onDatabaseChange(handler: DatabaseChangeHandler): () => void {
    this.databaseChangeHandlers.add(handler);
    
    // Return cleanup function
    return () => {
      this.databaseChangeHandlers.delete(handler);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Disconnect the Socket.IO connection
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.channels.clear();
    this.databaseChangeHandlers.clear();
  }
}

// Singleton instance
let socketIOClient: SocketIOClient | null = null;

export function getSocketIOClient(baseUrl: string): SocketIOClient {
  if (!socketIOClient) {
    socketIOClient = new SocketIOClient(baseUrl);
  }
  return socketIOClient;
}

