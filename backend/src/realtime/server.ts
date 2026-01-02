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
import { appendFileSync } from 'fs';

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
  // Store channels by userId to preserve across reconnects
  private userChannels: Map<string, Set<string>> = new Map();
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

      // Check if this user already has a connection (reconnect scenario)
      // If so, preserve their channels
      let existingChannels = new Set<string>();
      
      // First, try to get channels from existing WebSocket connection
      for (const [existingWs, existingClient] of this.clients.entries()) {
        if (existingClient.userId === user.id) {
          // Preserve channels from existing connection
          existingChannels = new Set(existingClient.channels);
          // Remove old connection
          this.clients.delete(existingWs);
          try {
            existingWs.close();
          } catch (e) {
            // Ignore errors closing old connection
          }
          break;
        }
      }
      
      // If no existing connection found, try to restore from userChannels map
      if (existingChannels.size === 0 && this.userChannels.has(user.id)) {
        existingChannels = new Set(this.userChannels.get(user.id)!);
      }

      // Create client connection
      const client: ClientConnection = {
        ws,
        userId: user.id,
        channels: existingChannels, // Preserve channels from previous connection if reconnecting
        isAlive: true,
      };
      
      // Store channels in userChannels map for future reconnects
      this.userChannels.set(user.id, existingChannels);

      this.clients.set(ws, client);
      // #region agent log
      try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:101',message:'Client connected',data:{userId:user.id,preservedChannels:existingChannels.size,channels:Array.from(existingChannels)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
      // #endregion
      
      // Notify client of restored subscriptions so frontend can sync its channel state
      // This ensures frontend knows about channels even if it lost its local state
      if (existingChannels.size > 0) {
        // Send subscribed messages for all restored channels
        // Frontend will receive these and update its channel state accordingly
        for (const channel of existingChannels) {
          this.send(ws, {
            event: 'CUSTOM',
            channel: 'system',
            payload: {
              type: 'subscribed',
              channel,
            },
          });
        }
      }
      console.log(`[Realtime] Client connected: ${user.id} (preserved ${existingChannels.size} channels)`);

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
    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:166',message:'handleSubscribe entry',data:{userId:client.userId,channel,wsReadyState:client.ws.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
    // #endregion
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
    // Update userChannels map to persist across reconnects
    if (!this.userChannels.has(client.userId)) {
      this.userChannels.set(client.userId, new Set());
    }
    this.userChannels.get(client.userId)!.add(channel);
    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:187',message:'channel added to client',data:{userId:client.userId,channel,totalChannels:client.channels.size,allChannels:Array.from(client.channels)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
    // #endregion
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
    // Update userChannels map
    if (this.userChannels.has(client.userId)) {
      this.userChannels.get(client.userId)!.delete(channel);
    }
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
   * Extract UUID from channel name
   * Handles formats like:
   * - board:{uuid}
   * - board-{uuid}-cards/columns/members
   * - workspace:{uuid}
   * - user-{uuid}-board-membership
   * - user-{uuid}-workspace-membership
   */
  private extractUuidFromChannel(channel: string, prefix: string): string | undefined {
    // UUID regex: 8-4-4-4-12 hexadecimal characters
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    
    if (channel.startsWith(`${prefix}:`)) {
      // Format: prefix:{uuid}
      const uuid = channel.substring(prefix.length + 1);
      // #region agent log
      try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:extractUuidFromChannel',message:'UUID extracted from colon format',data:{channel,prefix,uuid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n');}catch(e){}
      // #endregion
      return uuid;
    } else if (channel.startsWith(`${prefix}-`)) {
      // Format: prefix-{uuid}-...
      const match = channel.match(uuidRegex);
      if (match) {
        const uuid = match[0];
        // #region agent log
        try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:extractUuidFromChannel',message:'UUID extracted from dash format',data:{channel,prefix,uuid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n');}catch(e){}
        // #endregion
        return uuid;
      }
      // #region agent log
      try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:extractUuidFromChannel',message:'UUID not found in dash format',data:{channel,prefix},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n');}catch(e){}
      // #endregion
    }
    
    return undefined;
  }

  /**
   * Broadcast event to all clients subscribed to a channel
   */
  async broadcast(event: RealtimeEvent) {
    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:231',message:'broadcast entry',data:{channel:event.channel,table:event.table,event:event.event,clientCount:this.clients.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
    // #endregion
    const { channel } = event;
    let sentCount = 0;

    // Extract boardId from channel for access check
    const boardId = this.extractUuidFromChannel(channel, 'board');

    let subscribedClients = 0;
    for (const [ws, client] of this.clients.entries()) {
      const hasChannel = client.channels.has(channel);
      // #region agent log
      try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:287',message:'checking client subscription',data:{userId:client.userId,channel,hasChannel,wsReadyState:ws.readyState,totalChannels:client.channels.size,allChannels:Array.from(client.channels)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
      // #endregion
      if (hasChannel) {
        subscribedClients++;
        // For board channels, verify user has access
        // Skip access check for membership events - they should always propagate
        // (e.g., when a user is added, they need to receive the event even if access check hasn't updated yet)
        if (boardId && event.table !== 'boardMembers') {
          const hasAccess = await this.checkBoardAccess(client.userId, boardId);
          // #region agent log
          try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:252',message:'access check result',data:{userId:client.userId,boardId,hasAccess,table:event.table},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
          // #endregion
          if (!hasAccess) {
            // Remove subscription if access revoked
            console.log(`[Realtime] Access check blocked event for client ${client.userId} on channel ${channel}, table: ${event.table}`);
            client.channels.delete(channel);
            continue;
          }
        }

        console.log(`[Realtime] Sending event to client ${client.userId} on channel ${channel}:`, {
          table: event.table,
          event: event.event,
        });
        // #region agent log
        try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:262',message:'sending event to client',data:{userId:client.userId,channel,table:event.table,event:event.event,wsReadyState:ws.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
        // #endregion
        this.send(ws, event);
        sentCount++;
      }
    }

    console.log(`[Realtime] Broadcasted ${event.event} on ${channel} to ${sentCount} clients`);
    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:271',message:'broadcast complete',data:{channel,table:event.table,event:event.event,sentCount,subscribedClients,totalClients:this.clients.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
    // #endregion
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
    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:317',message:'emitDatabaseChange entry',data:{table,event,hasNewRecord:!!newRecord,hasOldRecord:!!oldRecord,boardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n');}catch(e){}
    // #endregion
    // Determine channels based on table and context
    // Support both formats: board:${boardId} and board-${boardId}-${table}
    // Also emit to workspace channels for board-level changes
    const channels: string[] = [];
    let resolvedBoardId: string | undefined = boardId;
    let resolvedWorkspaceId: string | undefined;

    if (resolvedBoardId) {
      channels.push(`board:${resolvedBoardId}`);
      // Also emit to table-specific channels for compatibility
      if (table === 'cards') {
        channels.push(`board-${resolvedBoardId}-cards`);
      } else if (table === 'columns') {
        channels.push(`board-${resolvedBoardId}-columns`);
      } else if (table === 'boardMembers') {
        const channel = `board-${resolvedBoardId}-members`;
        console.log(`[Realtime] Adding boardMembers channel: ${channel}`);
        channels.push(channel);
        // Also emit to workspace channel for member changes
        // Use resolvedBoardId (from parameter) instead of memberRecord.boardId
        if (resolvedBoardId) {
          const board = await prisma.board.findUnique({
            where: { id: resolvedBoardId },
            select: { workspaceId: true },
          });
          if (board?.workspaceId) {
            channels.push(`workspace:${board.workspaceId}`);
          }
        }
      } else if (table === 'boards') {
        // For board changes, also emit to workspace channel
        const boardRecord = (newRecord || oldRecord) as { workspaceId?: string };
        if (boardRecord?.workspaceId) {
          resolvedWorkspaceId = boardRecord.workspaceId;
          channels.push(`workspace:${resolvedWorkspaceId}`);
        }
      }
    } else if (table === 'boardMembers' && newRecord) {
      // Prisma models use camelCase (boardId), not snake_case (board_id)
      resolvedBoardId = (newRecord as any).boardId || (newRecord as any).board_id;
      if (resolvedBoardId) {
        channels.push(`board:${resolvedBoardId}`);
        const channel = `board-${resolvedBoardId}-members`;
        console.log(`[Realtime] Adding boardMembers channel from newRecord: ${channel}`);
        channels.push(channel);
        // Also emit to workspace channel for member changes
        const board = await prisma.board.findUnique({
          where: { id: resolvedBoardId },
          select: { workspaceId: true },
        });
        if (board?.workspaceId) {
          channels.push(`workspace:${board.workspaceId}`);
        }
      }
    } else if (table === 'boardMembers' && oldRecord) {
      // Prisma models use camelCase (boardId), not snake_case (board_id)
      resolvedBoardId = (oldRecord as any).boardId || (oldRecord as any).board_id;
      if (resolvedBoardId) {
        channels.push(`board:${resolvedBoardId}`);
        const channel = `board-${resolvedBoardId}-members`;
        console.log(`[Realtime] Adding boardMembers channel from oldRecord: ${channel}`);
        channels.push(channel);
        // Also emit to workspace channel for member changes
        const board = await prisma.board.findUnique({
          where: { id: resolvedBoardId },
          select: { workspaceId: true },
        });
        if (board?.workspaceId) {
          channels.push(`workspace:${board.workspaceId}`);
        }
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
    } else if (table === 'workspaceMembers') {
      // For workspace membership changes, emit to multiple channels
      const workspaceRecord = (newRecord || oldRecord) as { workspaceId?: string; userId?: string };
      if (workspaceRecord?.workspaceId) {
        channels.push(`workspace:${workspaceRecord.workspaceId}`);
      }
      // Emit to user-specific channels so the affected user receives the event
      // Support both formats for compatibility
      if (workspaceRecord?.userId) {
        channels.push(`user:${workspaceRecord.userId}`);
        channels.push(`user-${workspaceRecord.userId}-workspace-membership`);
      }
      // Also emit to global channel for filtered subscriptions
      channels.push('global');
    } else {
      // Global channel for app-level changes
      channels.push('global');
    }

    // Broadcast to all relevant channels
    console.log('[Realtime] Emitting event:', {
      table,
      event,
      channels,
      hasNewRecord: !!newRecord,
      hasOldRecord: !!oldRecord,
      newRecordId: (newRecord as any)?.id || (newRecord as any)?.userId,
      oldRecordId: (oldRecord as any)?.id || (oldRecord as any)?.userId,
    });
    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:407',message:'channels determined',data:{table,event,channels,channelCount:channels.length,resolvedBoardId,resolvedWorkspaceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n');}catch(e){}
    // #endregion

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

