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
    // Hierarchy metadata for parent-child model
    entityType?: 'board' | 'column' | 'card' | 'cardDetail' | 'member' | 'workspace';
    entityId?: string;
    parentId?: string; // boardId for columns, columnId for cards, cardId for details
    workspaceId?: string;
    [key: string]: unknown;
  };
}

class RealtimeServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  // Store channels by userId to preserve across reconnects
  private userChannels: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  // Cache board access checks to avoid race conditions when users are promoted
  // Key: `${userId}:${boardId}`, Value: { hasAccess: boolean, timestamp: number }
  private accessCache: Map<string, { hasAccess: boolean; timestamp: number }> = new Map();
  private readonly ACCESS_CACHE_TTL = 5000; // 5 seconds cache TTL
  // Cache workspaceId lookups to reduce database queries
  // Key: `${table}:${entityId}`, Value: { workspaceId: string, timestamp: number }
  private workspaceIdCache: Map<string, { workspaceId: string; timestamp: number }> = new Map();
  private readonly WORKSPACE_ID_CACHE_TTL = 30000; // 30 seconds cache TTL

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
   * - workspace:{uuid}
   * - user:{uuid}
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
        // For INSERT events, be more lenient - newly created items should propagate to all subscribers
        // This ensures new columns/cards are visible to all users immediately
        if (boardId && event.table !== 'boardMembers') {
          // For INSERT events, use cached access (faster) but don't block if cache is stale
          // This ensures newly promoted users' creations are visible immediately
          const forceRefresh = event.event === 'UPDATE' || event.event === 'DELETE';
          const hasAccess = await this.checkBoardAccess(client.userId, boardId, forceRefresh);
          // #region agent log
          try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:252',message:'access check result',data:{userId:client.userId,boardId,hasAccess,table:event.table,event:event.event,forceRefresh},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
          // #endregion
          if (!hasAccess) {
            // Only remove subscription for UPDATE/DELETE events, not INSERT
            // This allows newly promoted users to see new items immediately
            if (event.event !== 'INSERT') {
              console.log(`[Realtime] Access check blocked event for client ${client.userId} on channel ${channel}, table: ${event.table}, event: ${event.event}`);
              client.channels.delete(channel);
              continue;
            } else {
              console.log(`[Realtime] Access check failed for INSERT event, but allowing through for client ${client.userId} on channel ${channel}`);
            }
          }
        }

        // #region agent log
        try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:262',message:'sending event to client',data:{userId:client.userId,channel,table:event.table,event:event.event,wsReadyState:ws.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
        // #endregion
        this.send(ws, event);
        sentCount++;
      }
    }

    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:271',message:'broadcast complete',data:{channel,table:event.table,event:event.event,sentCount,subscribedClients,totalClients:this.clients.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n');}catch(e){}
    // #endregion
  }

  /**
   * Check if user has access to a board
   * Uses caching to avoid race conditions when users are promoted
   */
  private async checkBoardAccess(userId: string, boardId: string, forceRefresh = false): Promise<boolean> {
    const cacheKey = `${userId}:${boardId}`;
    const now = Date.now();
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.accessCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < this.ACCESS_CACHE_TTL) {
        return cached.hasAccess;
      }
    }

    // Fetch fresh data
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

    const hasAccess = !!membership || !!user?.profile?.isAdmin;
    
    // Update cache
    this.accessCache.set(cacheKey, { hasAccess, timestamp: now });
    
    return hasAccess;
  }

  /**
   * Invalidate access cache for a user/board combination
   * Call this when membership changes to ensure fresh access checks
   * If userId is '*', invalidates all users for that board
   */
  private invalidateAccessCache(userId: string, boardId: string) {
    if (userId === '*') {
      // Invalidate all users for this board
      for (const key of this.accessCache.keys()) {
        if (key.endsWith(`:${boardId}`)) {
          this.accessCache.delete(key);
        }
      }
    } else {
      const cacheKey = `${userId}:${boardId}`;
      this.accessCache.delete(cacheKey);
    }
  }

  /**
   * Resolve workspaceId for a given entity
   * Uses caching to reduce database queries
   */
  private async resolveWorkspaceId(
    table: string,
    entityId: string | undefined,
    boardId?: string,
    columnId?: string,
    cardId?: string
  ): Promise<string | undefined> {
    if (!entityId && !boardId && !columnId && !cardId) {
      return undefined;
    }

    const now = Date.now();
    let cacheKey: string | undefined;
    let workspaceId: string | undefined;

    // Check cache first
    if (boardId) {
      cacheKey = `board:${boardId}`;
      const cached = this.workspaceIdCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < this.WORKSPACE_ID_CACHE_TTL) {
        return cached.workspaceId;
      }
      // Fetch from database
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        select: { workspaceId: true },
      });
      workspaceId = board?.workspaceId;
    } else if (columnId) {
      cacheKey = `column:${columnId}`;
      const cached = this.workspaceIdCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < this.WORKSPACE_ID_CACHE_TTL) {
        return cached.workspaceId;
      }
      // Fetch from database: column → board → workspaceId
      const column = await prisma.column.findUnique({
        where: { id: columnId },
        select: { boardId: true },
      });
      if (column?.boardId) {
        const board = await prisma.board.findUnique({
          where: { id: column.boardId },
          select: { workspaceId: true },
        });
        workspaceId = board?.workspaceId;
        // Cache board lookup too
        if (workspaceId) {
          this.workspaceIdCache.set(`board:${column.boardId}`, { workspaceId, timestamp: now });
        }
      }
    } else if (cardId) {
      cacheKey = `card:${cardId}`;
      const cached = this.workspaceIdCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < this.WORKSPACE_ID_CACHE_TTL) {
        return cached.workspaceId;
      }
      // Fetch from database: card → column → board → workspaceId
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        include: { column: { select: { boardId: true } } },
      });
      if (card?.column?.boardId) {
        const board = await prisma.board.findUnique({
          where: { id: card.column.boardId },
          select: { workspaceId: true },
        });
        workspaceId = board?.workspaceId;
        // Cache board and column lookups too
        if (workspaceId) {
          this.workspaceIdCache.set(`board:${card.column.boardId}`, { workspaceId, timestamp: now });
          this.workspaceIdCache.set(`column:${card.columnId}`, { workspaceId, timestamp: now });
        }
      }
    }

    // Update cache
    if (cacheKey && workspaceId) {
      this.workspaceIdCache.set(cacheKey, { workspaceId, timestamp: now });
    }

    return workspaceId;
  }

  /**
   * Determine entity type and hierarchy metadata for an event
   */
  private determineEntityMetadata(
    table: string,
    newRecord?: Record<string, unknown>,
    oldRecord?: Record<string, unknown>,
    boardId?: string,
    workspaceId?: string
  ): {
    entityType: 'board' | 'column' | 'card' | 'cardDetail' | 'member' | 'workspace';
    entityId: string | undefined;
    parentId: string | undefined;
  } {
    const record = newRecord || oldRecord;
    const entityId = (record as any)?.id || (record as any)?.userId;

    if (table === 'boards') {
      return { entityType: 'board', entityId, parentId: workspaceId };
    } else if (table === 'columns') {
      const columnBoardId = (record as any)?.boardId || (record as any)?.board_id || boardId;
      return { entityType: 'column', entityId, parentId: columnBoardId };
    } else if (table === 'cards') {
      const cardColumnId = (record as any)?.columnId || (record as any)?.column_id;
      return { entityType: 'card', entityId, parentId: cardColumnId };
    } else if (table.startsWith('card_')) {
      const cardId = (record as any)?.cardId || (record as any)?.card_id;
      return { entityType: 'cardDetail', entityId, parentId: cardId };
    } else if (table === 'boardMembers') {
      return { entityType: 'member', entityId, parentId: boardId };
    } else if (table === 'workspaceMembers' || table === 'workspaces') {
      return { entityType: 'workspace', entityId, parentId: undefined };
    }

    // Default fallback
    return { entityType: 'board', entityId, parentId: undefined };
  }

  /**
   * Emit database change event
   * Refactored to use parent-child hierarchy: always emit to workspace channel first
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
    
    // Step 1: Resolve entity IDs from records
    const record = newRecord || oldRecord;
    const entityId = (record as any)?.id || (record as any)?.userId;
    
    let resolvedBoardId: string | undefined = boardId;
    let resolvedColumnId: string | undefined;
    let resolvedCardId: string | undefined;
    let resolvedWorkspaceId: string | undefined;

    // Resolve IDs based on table type
    if (table === 'boards') {
      resolvedBoardId = entityId;
      resolvedWorkspaceId = (record as any)?.workspaceId || (record as any)?.workspace_id;
    } else if (table === 'columns') {
      resolvedBoardId = (record as any)?.boardId || (record as any)?.board_id || boardId;
      resolvedColumnId = entityId;
    } else if (table === 'cards') {
      resolvedColumnId = (record as any)?.columnId || (record as any)?.column_id;
      resolvedCardId = entityId;
    } else if (table.startsWith('card_')) {
      // Card details: attachments, subtasks, assignees, labels
      resolvedCardId = (record as any)?.cardId || (record as any)?.card_id;
    } else if (table === 'boardMembers') {
      resolvedBoardId = (record as any)?.boardId || (record as any)?.board_id || boardId;
    } else if (table === 'workspaceMembers' || table === 'workspaces') {
      resolvedWorkspaceId = (record as any)?.workspaceId || (record as any)?.workspace_id || entityId;
    }

    // Step 2: Resolve workspaceId using helper (with caching)
    if (!resolvedWorkspaceId) {
      resolvedWorkspaceId = await this.resolveWorkspaceId(
        table,
        entityId,
        resolvedBoardId,
        resolvedColumnId,
        resolvedCardId
      );
    }

    // Step 3: Determine entity metadata
    const { entityType, parentId } = this.determineEntityMetadata(
      table,
      newRecord,
      oldRecord,
      resolvedBoardId,
      resolvedWorkspaceId
    );

    // Step 4: Build channels - ALWAYS emit to workspace channel first (parent-child model)
    const channels: string[] = [];
    
    // Primary channel: workspace (parent-child hierarchy)
    if (resolvedWorkspaceId) {
      channels.push(`workspace:${resolvedWorkspaceId}`);
    }

    // Keep board channel for backward compatibility (temporary)
    // TODO: Remove after full migration to workspace subscriptions
    if (resolvedBoardId) {
      channels.push(`board:${resolvedBoardId}`);
    }

    // Special handling for workspace membership and workspace changes
    if (table === 'workspaceMembers') {
      const workspaceRecord = (newRecord || oldRecord) as { workspaceId?: string; userId?: string };
      if (workspaceRecord?.workspaceId) {
        // Already added above, but ensure it's there
        if (!channels.includes(`workspace:${workspaceRecord.workspaceId}`)) {
          channels.push(`workspace:${workspaceRecord.workspaceId}`);
        }
      }
      // Emit to user-specific channels
      if (workspaceRecord?.userId) {
        channels.push(`user:${workspaceRecord.userId}`);
      }
      channels.push('global');
    } else if (table === 'workspaces') {
      // Workspace changes - already added above
      channels.push('global');
    } else if (!resolvedWorkspaceId && !resolvedBoardId) {
      // Global channel for app-level changes that don't belong to a workspace
      channels.push('global');
    }

    // Step 5: Broadcast to all relevant channels
    // Note: entityType and parentId are already determined in Step 3 above
    // #region agent log
    try{appendFileSync('/mnt/e/atlantisboard/.cursor/debug.log',JSON.stringify({location:'server.ts:407',message:'channels determined',data:{table,event,channels,channelCount:channels.length,resolvedBoardId,resolvedWorkspaceId,entityType,entityId,parentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n');}catch(e){}
    // #endregion

    // Invalidate access cache when boardMembers change to ensure fresh access checks
    // This prevents race conditions when users are promoted
    if (table === 'boardMembers' && resolvedBoardId) {
      // Invalidate cache for all users on this board
      this.invalidateAccessCache('*', resolvedBoardId);
      console.log(`[Realtime] Invalidated access cache for board ${resolvedBoardId} due to membership change`);
    }

    // Step 6: Build optimized payload
    let payload: Record<string, unknown>;
    
    if (event === 'UPDATE' && newRecord && oldRecord) {
      // Differential update: send only changed fields
      const changedFields: Record<string, unknown> = {};
      const newRecordObj = newRecord as Record<string, unknown>;
      const oldRecordObj = oldRecord as Record<string, unknown>;
      
      // Compare all fields and include only changed ones
      const allKeys = new Set([...Object.keys(newRecordObj), ...Object.keys(oldRecordObj)]);
      for (const key of allKeys) {
        const newValue = newRecordObj[key];
        const oldValue = oldRecordObj[key];
        
        // Deep comparison for objects/arrays (simplified - just JSON stringify)
        if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
          changedFields[key] = newValue;
        }
      }
      
      // Always include id for UPDATE events
      payload = {
        changedFields,
        id: entityId,
        // Hierarchy metadata for parent-child model
        entityType,
        parentId,
        workspaceId: resolvedWorkspaceId,
        // Include full record for backward compatibility (can be removed later)
        new: newRecord,
        old: oldRecord,
      };
    } else if (event === 'DELETE' && oldRecord) {
      // Minimal payload for DELETE events
      payload = {
        id: entityId,
        entityType,
        parentId,
        workspaceId: resolvedWorkspaceId,
        // Include old record for backward compatibility
        old: oldRecord,
      };
    } else {
      // INSERT or fallback: send full record
      payload = {
        new: newRecord,
        old: oldRecord,
        // Hierarchy metadata for parent-child model
        entityType,
        entityId,
        parentId,
        workspaceId: resolvedWorkspaceId,
      };
    }

    // Step 7: Broadcast to all channels with optimized payload
    for (const channel of channels) {
      await this.broadcast({
        event: event as 'INSERT' | 'UPDATE' | 'DELETE',
        table,
        channel,
        payload,
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

