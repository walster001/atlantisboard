/**
 * WebSocket Server for Realtime Updates
 * 
 * Replaces Supabase Realtime with a custom WebSocket implementation.
 * Supports channel subscriptions and event broadcasting.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
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

interface RealtimeClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  channel?: string;
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

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
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

  private handleMessage(client: ClientConnection, message: RealtimeClientMessage) {
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

    // Access checks are performed during event broadcast, not during subscription
    // This allows subscription but validates access when events are emitted

    client.channels.add(channel);
    // Update userChannels map to persist across reconnects
    if (!this.userChannels.has(client.userId)) {
      this.userChannels.set(client.userId, new Set());
    }
    this.userChannels.get(client.userId)!.add(channel);
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
   * - workspace:{uuid} (primary channel format)
   * - board:{uuid} (legacy, no longer used)
   * - user:{uuid}
   */
  private extractUuidFromChannel(channel: string, prefix: string): string | undefined {
    // UUID regex: 8-4-4-4-12 hexadecimal characters
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    
    if (channel.startsWith(`${prefix}:`)) {
      // Format: prefix:{uuid}
      const uuid = channel.substring(prefix.length + 1);
      return uuid;
    } else if (channel.startsWith(`${prefix}-`)) {
      // Format: prefix-{uuid}-...
      const match = channel.match(uuidRegex);
      if (match) {
        const uuid = match[0];
        return uuid;
      }
    }
    
    return undefined;
  }

  /**
   * Broadcast event to all clients subscribed to a channel
   */
  async broadcast(event: RealtimeEvent) {
    const { channel } = event;
    let sentCount = 0;

    // Extract boardId from channel for access check (board channels)
    let boardIdForAccessCheck = this.extractUuidFromChannel(channel, 'board');

    // For workspace channels, extract boardId from event payload
    if (!boardIdForAccessCheck && channel.startsWith('workspace:')) {
      const payload = event.payload;
      const entityType = payload?.entityType as string | undefined;
      
      // Extract boardId based on entity type
      if (entityType === 'board') {
        // For board events, boardId is the entityId
        boardIdForAccessCheck = payload?.entityId as string | undefined || 
                                payload?.id as string | undefined ||
                                (payload?.new as Record<string, unknown> | undefined)?.id as string | undefined ||
                                (payload?.old as Record<string, unknown> | undefined)?.id as string | undefined;
      } else if (entityType === 'column') {
        // For column events, boardId is the parentId
        boardIdForAccessCheck = payload?.parentId as string | undefined ||
                                (payload?.new as Record<string, unknown> | undefined)?.boardId as string | undefined ||
                                (payload?.old as Record<string, unknown> | undefined)?.boardId as string | undefined;
      } else if (entityType === 'member') {
        // For member events, boardId is the parentId
        boardIdForAccessCheck = payload?.parentId as string | undefined ||
                                (payload?.new as Record<string, unknown> | undefined)?.boardId as string | undefined ||
                                (payload?.old as Record<string, unknown> | undefined)?.boardId as string | undefined;
      } else if (entityType === 'card') {
        // For card events, need to extract from record
        const record = payload?.new || payload?.old;
        if (record) {
          const recordObj = record as Record<string, unknown>;
          const columnId = recordObj?.columnId as string | undefined || recordObj?.column_id as string | undefined;
          if (columnId) {
            // Resolve column to boardId (use existing cache if available)
            // For now, we'll allow the event through and rely on workspace-level access
            // Cards require column lookup which is expensive, so we skip access check for cards
            // Workspace subscription already implies workspace access
            boardIdForAccessCheck = undefined;
          }
        }
      }
      // For cardDetail and workspace entities, skip board-level access check
      // They are handled at workspace level
    }

    let subscribedClients = 0;
    for (const [ws, client] of this.clients.entries()) {
      const hasChannel = client.channels.has(channel);
      if (hasChannel) {
        subscribedClients++;
        // For board-related events, verify user has access to the board
        // Skip access check for membership events - they should always propagate
        // (e.g., when a user is added, they need to receive the event even if access check hasn't updated yet)
        // For INSERT events, be more lenient - newly created items should propagate to all subscribers
        // This ensures new columns/cards are visible to all users immediately
        if (boardIdForAccessCheck && event.table !== 'boardMembers') {
          // For INSERT events, use cached access (faster) but don't block if cache is stale
          // This ensures newly promoted users' creations are visible immediately
          const forceRefresh = event.event === 'UPDATE' || event.event === 'DELETE';
          const hasAccess = await this.checkBoardAccess(client.userId, boardIdForAccessCheck, forceRefresh);
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

        this.send(ws, event);
        sentCount++;
      }
    }

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
   * Generate cache key for an entity
   * Supports entity-based keys: card:${id}, column:${id}, board:${id}
   */
  private getCacheKey(entityType: 'board' | 'column' | 'card', entityId: string): string {
    return `${entityType}:${entityId}`;
  }

  /**
   * Invalidate workspaceId cache for entities
   * Call this when cards/columns/boards are moved or deleted
   */
  private invalidateWorkspaceIdCache(entityType: 'board' | 'column' | 'card', entityId: string) {
    const cacheKey = this.getCacheKey(entityType, entityId);
    this.workspaceIdCache.delete(cacheKey);
  }

  /**
   * Cascade invalidate workspaceId cache for related entities
   * When a column is moved, invalidate all cards in that column
   * When a board is moved, invalidate all columns and cards in that board
   */
  private async invalidateWorkspaceIdCacheCascade(
    entityType: 'board' | 'column' | 'card',
    entityId: string
  ): Promise<void> {
    // Invalidate the entity itself
    this.invalidateWorkspaceIdCache(entityType, entityId);
    
    if (entityType === 'board') {
      // Invalidate all columns in this board
      const columns = await prisma.column.findMany({
        where: { boardId: entityId },
        select: { id: true },
      });
      columns.forEach(col => {
        this.invalidateWorkspaceIdCache('column', col.id);
      });
      
      // Invalidate all cards in this board (via columns)
      // Query cards directly with columnId IN (...) for efficiency
      if (columns.length > 0) {
        const columnIds = columns.map(col => col.id);
        const cards = await prisma.card.findMany({
          where: { columnId: { in: columnIds } },
          select: { id: true },
        });
        cards.forEach(card => {
          this.invalidateWorkspaceIdCache('card', card.id);
        });
      }
    } else if (entityType === 'column') {
      // Invalidate all cards in this column
      const cards = await prisma.card.findMany({
        where: { columnId: entityId },
        select: { id: true },
      });
      cards.forEach(card => {
        this.invalidateWorkspaceIdCache('card', card.id);
      });
    }
    // Cards don't cascade to anything
  }

  /**
   * Resolve workspaceId for a given entity
   * Uses caching to reduce database queries
   */
  private async resolveWorkspaceId(
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
      cacheKey = this.getCacheKey('board', boardId);
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
      cacheKey = this.getCacheKey('column', columnId);
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
          this.workspaceIdCache.set(this.getCacheKey('board', column.boardId), { workspaceId, timestamp: now });
        }
      }
    } else if (cardId) {
      cacheKey = this.getCacheKey('card', cardId);
      const cached = this.workspaceIdCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < this.WORKSPACE_ID_CACHE_TTL) {
        // Cache validation: Only validate if cache is getting old (within 5 seconds of expiry)
        // This provides a safety check without adding overhead to every lookup
        const cacheAge = now - cached.timestamp;
        const validationThreshold = this.WORKSPACE_ID_CACHE_TTL - 5000; // Validate if within 5s of expiry
        if (cacheAge > validationThreshold) {
          // Cache is getting old - verify card still exists and hasn't been moved
          const card = await prisma.card.findUnique({
            where: { id: cardId },
            select: { columnId: true },
          });
          if (!card) {
            // Card was deleted - invalidate cache
            this.workspaceIdCache.delete(cacheKey);
            // Fall through to fresh lookup (which will return undefined)
          } else {
            // Card exists - cache is still valid, return it
            return cached.workspaceId;
          }
        } else {
          // Cache is fresh - trust it without validation
          return cached.workspaceId;
        }
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
        // Cache board, column, and card lookups for better performance
        // This is especially important for card_* tables (attachments, subtasks, etc.)
        if (workspaceId) {
          this.workspaceIdCache.set(this.getCacheKey('board', card.column.boardId), { workspaceId, timestamp: now });
          this.workspaceIdCache.set(this.getCacheKey('column', card.columnId), { workspaceId, timestamp: now });
          this.workspaceIdCache.set(this.getCacheKey('card', cardId), { workspaceId, timestamp: now });
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
    const recordObj = record as Record<string, unknown> | undefined;
    const entityId = recordObj?.id as string | undefined || recordObj?.userId as string | undefined;

    if (table === 'boards') {
      return { entityType: 'board', entityId, parentId: workspaceId };
    } else if (table === 'columns') {
      const columnBoardId = recordObj?.boardId as string | undefined || recordObj?.board_id as string | undefined || boardId;
      return { entityType: 'column', entityId, parentId: columnBoardId };
    } else if (table === 'cards') {
      const cardColumnId = recordObj?.columnId as string | undefined || recordObj?.column_id as string | undefined;
      return { entityType: 'card', entityId, parentId: cardColumnId };
    } else if (table.startsWith('card_')) {
      const cardId = recordObj?.cardId as string | undefined || recordObj?.card_id as string | undefined;
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
    // Step 1: Resolve entity IDs from records
    const record = newRecord || oldRecord;
    const recordObj = record as Record<string, unknown> | undefined;
    const entityId = recordObj?.id as string | undefined || recordObj?.userId as string | undefined;
    
    let resolvedBoardId: string | undefined = boardId;
    let resolvedColumnId: string | undefined;
    let resolvedCardId: string | undefined;
    let resolvedWorkspaceId: string | undefined;

    // Resolve IDs based on table type
    if (table === 'boards') {
      resolvedBoardId = entityId;
      resolvedWorkspaceId = recordObj?.workspaceId as string | undefined || recordObj?.workspace_id as string | undefined;
    } else if (table === 'columns') {
      resolvedBoardId = recordObj?.boardId as string | undefined || recordObj?.board_id as string | undefined || boardId;
      resolvedColumnId = entityId;
    } else if (table === 'cards') {
      resolvedColumnId = recordObj?.columnId as string | undefined || recordObj?.column_id as string | undefined;
      resolvedCardId = entityId;
    } else if (table.startsWith('card_')) {
      // Card details: attachments, subtasks, assignees, labels
      resolvedCardId = recordObj?.cardId as string | undefined || recordObj?.card_id as string | undefined;
    } else if (table === 'boardMembers') {
      resolvedBoardId = recordObj?.boardId as string | undefined || recordObj?.board_id as string | undefined || boardId;
    } else if (table === 'workspaceMembers' || table === 'workspaces') {
      resolvedWorkspaceId = recordObj?.workspaceId as string | undefined || recordObj?.workspace_id as string | undefined || entityId;
    }

    // Step 2: Resolve workspaceId using helper (with caching)
    if (!resolvedWorkspaceId) {
      resolvedWorkspaceId = await this.resolveWorkspaceId(
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

    // Invalidate access cache when boardMembers change to ensure fresh access checks
    // This prevents race conditions when users are promoted
    if (table === 'boardMembers' && resolvedBoardId) {
      // Invalidate cache for all users on this board
      this.invalidateAccessCache('*', resolvedBoardId);
      console.log(`[Realtime] Invalidated access cache for board ${resolvedBoardId} due to membership change`);
    }

    // Invalidate workspaceId cache when cards/columns/boards are moved or deleted
    // Use cascade invalidation when entities actually move (boardId/workspaceId changes)
    if (event === 'DELETE') {
      const deleteEntityId = recordObj?.id as string | undefined;
      if (deleteEntityId) {
        if (table === 'boards') {
          await this.invalidateWorkspaceIdCacheCascade('board', deleteEntityId);
        } else if (table === 'columns') {
          await this.invalidateWorkspaceIdCacheCascade('column', deleteEntityId);
        } else if (table === 'cards') {
          this.invalidateWorkspaceIdCache('card', deleteEntityId);
        }
      }
    } else if (event === 'UPDATE' && newRecord && oldRecord) {
      const updateEntityId = recordObj?.id as string | undefined;
      if (updateEntityId) {
        const oldRecordObj = oldRecord as Record<string, unknown>;
        const newRecordObj = newRecord as Record<string, unknown>;
        // Check if column moved to different board
        if (table === 'columns') {
          const oldBoardId = oldRecordObj?.boardId as string | undefined || oldRecordObj?.board_id as string | undefined;
          const newBoardId = newRecordObj?.boardId as string | undefined || newRecordObj?.board_id as string | undefined;
          if (oldBoardId && newBoardId && oldBoardId !== newBoardId) {
            // Column moved to different board - cascade invalidate
            await this.invalidateWorkspaceIdCacheCascade('column', updateEntityId);
          } else {
            // Column updated but didn't move - just invalidate the column itself
            this.invalidateWorkspaceIdCache('column', updateEntityId);
          }
        }
        // Check if board moved to different workspace
        else if (table === 'boards') {
          const oldWorkspaceId = oldRecordObj?.workspaceId as string | undefined || oldRecordObj?.workspace_id as string | undefined;
          const newWorkspaceId = newRecordObj?.workspaceId as string | undefined || newRecordObj?.workspace_id as string | undefined;
          if (oldWorkspaceId && newWorkspaceId && oldWorkspaceId !== newWorkspaceId) {
            // Board moved to different workspace - cascade invalidate
            await this.invalidateWorkspaceIdCacheCascade('board', updateEntityId);
          } else {
            // Board updated but didn't move - just invalidate the board itself
            this.invalidateWorkspaceIdCache('board', updateEntityId);
          }
        }
        // Check if card moved to different column (which might be in different board)
        else if (table === 'cards') {
          const oldColumnId = oldRecordObj?.columnId as string | undefined || oldRecordObj?.column_id as string | undefined;
          const newColumnId = newRecordObj?.columnId as string | undefined || newRecordObj?.column_id as string | undefined;
          if (oldColumnId && newColumnId && oldColumnId !== newColumnId) {
            // Card moved to different column - invalidate card cache
            // Note: We don't cascade from cards, but we should invalidate the card itself
            this.invalidateWorkspaceIdCache('card', updateEntityId);
          } else {
            // Card updated but didn't move - just invalidate the card itself
            this.invalidateWorkspaceIdCache('card', updateEntityId);
          }
        }
      }
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

