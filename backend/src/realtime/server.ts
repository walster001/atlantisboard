/**
 * WebSocket Server for Realtime Updates
 * 
 * Replaces Supabase Realtime with a custom WebSocket implementation.
 * Supports channel subscriptions and event broadcasting.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  channels: Set<string>;
  isAlive: boolean;
}

interface RealtimeEvent {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | 'CUSTOM';
  table?: string;
  channel: string;
  payload: {
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

class RealtimeServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/realtime' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Heartbeat to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (!client.isAlive) {
          this.removeClient(ws);
          return;
        }
        client.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  private async handleConnection(ws: WebSocket, req: any) {
    console.log('[Realtime] New connection attempt');

    // Extract token from query string or Authorization header
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    let token = url.searchParams.get('token') || url.searchParams.get('access_token');

    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      console.log('[Realtime] No token provided, closing connection');
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string; email: string };
      
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Create client connection
      const client: ClientConnection = {
        ws,
        userId: user.id,
        channels: new Set(),
        isAlive: true,
      };

      this.clients.set(ws, client);
      console.log(`[Realtime] Client connected: ${user.id}`);

      // Send connection confirmation
      this.send(ws, {
        event: 'CUSTOM',
        channel: 'system',
        payload: {
          type: 'connected',
          message: 'WebSocket connection established',
        },
      });

      // Handle messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(client, message);
        } catch (error) {
          console.error('[Realtime] Error parsing message:', error);
        }
      });

      // Handle pong (heartbeat response)
      ws.on('pong', () => {
        client.isAlive = true;
      });

      // Handle close
      ws.on('close', () => {
        console.log(`[Realtime] Client disconnected: ${user.id}`);
        this.removeClient(ws);
      });

      // Handle error
      ws.on('error', (error) => {
        console.error(`[Realtime] WebSocket error for ${user.id}:`, error);
        this.removeClient(ws);
      });
    } catch (error) {
      console.error('[Realtime] Authentication error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  private handleMessage(client: ClientConnection, message: any) {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(client, message.channel);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(client, message.channel);
        break;
      case 'ping':
        this.send(client.ws, {
          event: 'CUSTOM',
          channel: 'system',
          payload: { type: 'pong' },
        });
        break;
      default:
        console.warn('[Realtime] Unknown message type:', message.type);
    }
  }

  private handleSubscribe(client: ClientConnection, channel: string) {
    // Validate channel format
    if (!channel || typeof channel !== 'string') {
      this.send(client.ws, {
        event: 'CUSTOM',
        channel: 'system',
        payload: {
          type: 'error',
          message: 'Invalid channel format',
        },
      });
      return;
    }

    // Check board access for board channels
    if (channel.startsWith('board:')) {
      // const _boardId = channel.substring(7); // Permission check will be done when emitting events
      // Permission check will be done when emitting events
      // For now, just allow subscription
    }

    client.channels.add(channel);
    console.log(`[Realtime] Client ${client.userId} subscribed to ${channel}`);

    this.send(client.ws, {
      event: 'CUSTOM',
      channel: 'system',
      payload: {
        type: 'subscribed',
        channel,
      },
    });
  }

  private handleUnsubscribe(client: ClientConnection, channel: string) {
    client.channels.delete(channel);
    console.log(`[Realtime] Client ${client.userId} unsubscribed from ${channel}`);

    this.send(client.ws, {
      event: 'CUSTOM',
      channel: 'system',
      payload: {
        type: 'unsubscribed',
        channel,
      },
    });
  }

  private removeClient(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (client) {
      console.log(`[Realtime] Removing client: ${client.userId}`);
      this.clients.delete(ws);
    }
    ws.terminate();
  }

  private send(ws: WebSocket, event: RealtimeEvent) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Broadcast event to all clients subscribed to a channel
   */
  async broadcast(event: RealtimeEvent) {
    const { channel } = event;
    let sentCount = 0;

    // Extract boardId from channel for access check
    let boardId: string | undefined;
    if (channel.startsWith('board:')) {
      boardId = channel.substring(7);
    } else if (channel.startsWith('board-') && channel.includes('-')) {
      // Extract from board-${boardId}-cards format
      const parts = channel.split('-');
      if (parts.length >= 2) {
        boardId = parts[1];
      }
    }

    for (const [ws, client] of this.clients.entries()) {
      if (client.channels.has(channel)) {
        // For board channels, verify user has access
        if (boardId) {
          const hasAccess = await this.checkBoardAccess(client.userId, boardId);
          if (!hasAccess) {
            // Remove subscription if access revoked
            client.channels.delete(channel);
            continue;
          }
        }

        this.send(ws, event);
        sentCount++;
      }
    }

    console.log(`[Realtime] Broadcasted ${event.event} on ${channel} to ${sentCount} clients`);
  }

  /**
   * Check if user has access to a board
   */
  private async checkBoardAccess(userId: string, boardId: string): Promise<boolean> {
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
    });

    // Also check if user is app admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    return !!membership || !!user?.profile?.isAdmin;
  }

  /**
   * Emit database change event
   */
  async emitDatabaseChange(
    table: string,
    event: 'INSERT' | 'UPDATE' | 'DELETE',
    newRecord?: Record<string, unknown>,
    oldRecord?: Record<string, unknown>,
    boardId?: string
  ) {
    // Determine channels based on table and context
    // Support both formats: board:${boardId} and board-${boardId}-${table}
    const channels: string[] = [];
    let resolvedBoardId: string | undefined = boardId;

    if (resolvedBoardId) {
      channels.push(`board:${resolvedBoardId}`);
      // Also emit to table-specific channels for compatibility
      if (table === 'cards') {
        channels.push(`board-${resolvedBoardId}-cards`);
      } else if (table === 'columns') {
        channels.push(`board-${resolvedBoardId}-columns`);
      } else if (table === 'boardMembers') {
        channels.push(`board-${resolvedBoardId}-members`);
      }
    } else if (table === 'boardMembers' && newRecord) {
      // Prisma models use camelCase (boardId), not snake_case (board_id)
      resolvedBoardId = (newRecord as any).boardId || (newRecord as any).board_id;
      if (resolvedBoardId) {
        channels.push(`board:${resolvedBoardId}`);
        channels.push(`board-${resolvedBoardId}-members`);
      }
    } else if (table === 'boardMembers' && oldRecord) {
      // Prisma models use camelCase (boardId), not snake_case (board_id)
      resolvedBoardId = (oldRecord as any).boardId || (oldRecord as any).board_id;
      if (resolvedBoardId) {
        channels.push(`board:${resolvedBoardId}`);
        channels.push(`board-${resolvedBoardId}-members`);
      }
    } else if (table.startsWith('card_') && newRecord) {
      // For card-related tables, need to get boardId from card
      // Prisma models use camelCase (cardId), not snake_case (card_id)
      const cardId = (newRecord as any).cardId || (newRecord as any).card_id;
      if (cardId) {
        const card = await prisma.card.findUnique({
          where: { id: cardId },
          include: { column: true },
        });
        if (card) {
          resolvedBoardId = card.column.boardId;
          channels.push(`board:${resolvedBoardId}`);
          channels.push(`board-${resolvedBoardId}-cards`);
        } else {
          return; // Card not found, skip
        }
      } else {
        return; // No cardId, skip
      }
    } else if (table === 'columns' && newRecord) {
      // Prisma models use camelCase (boardId), not snake_case (board_id)
      resolvedBoardId = (newRecord as any).boardId || (newRecord as any).board_id;
      if (resolvedBoardId) {
        channels.push(`board:${resolvedBoardId}`);
        channels.push(`board-${resolvedBoardId}-columns`);
      }
    } else if (table === 'columns' && oldRecord) {
      // Prisma models use camelCase (boardId), not snake_case (board_id)
      resolvedBoardId = (oldRecord as any).boardId || (oldRecord as any).board_id;
      if (resolvedBoardId) {
        channels.push(`board:${resolvedBoardId}`);
        channels.push(`board-${resolvedBoardId}-columns`);
      }
    } else if (table === 'cards' && newRecord) {
      // Get boardId from column
      // Prisma models use camelCase (columnId), not snake_case (column_id)
      const columnId = (newRecord as any).columnId || (newRecord as any).column_id;
      if (columnId) {
        const column = await prisma.column.findUnique({
          where: { id: columnId },
        });
        if (column) {
          resolvedBoardId = column.boardId;
          channels.push(`board:${resolvedBoardId}`);
          channels.push(`board-${resolvedBoardId}-cards`);
        }
      }
    } else if (table === 'cards' && oldRecord) {
      // Prisma models use camelCase (columnId), not snake_case (column_id)
      const columnId = (oldRecord as any).columnId || (oldRecord as any).column_id;
      if (columnId) {
        const column = await prisma.column.findUnique({
          where: { id: columnId },
        });
        if (column) {
          resolvedBoardId = column.boardId;
          channels.push(`board:${resolvedBoardId}`);
          channels.push(`board-${resolvedBoardId}-cards`);
        }
      }
    } else {
      // Global channel for app-level changes
      channels.push('global');
    }

    // Broadcast to all relevant channels
    for (const channel of channels) {
      await this.broadcast({
        event,
        table,
        channel,
        payload: {
          new: newRecord,
          old: oldRecord,
        },
      });
    }
  }

  /**
   * Emit custom event (e.g., board.removed)
   */
  async emitCustomEvent(channel: string, eventType: string, payload: Record<string, unknown>) {
    await this.broadcast({
      event: 'CUSTOM',
      channel,
      payload: {
        type: eventType,
        ...payload,
      },
    });
  }

  /**
   * Cleanup on server shutdown
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.wss.close();
  }
}

let realtimeServer: RealtimeServer | null = null;

export function initializeRealtime(server: Server): RealtimeServer {
  if (realtimeServer) {
    return realtimeServer;
  }

  realtimeServer = new RealtimeServer(server);
  console.log('[Realtime] WebSocket server initialized on /realtime');
  return realtimeServer;
}

export function getRealtimeServer(): RealtimeServer | null {
  return realtimeServer;
}

