import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';

interface AuthenticatedSocket extends Socket {
  userId: string;
  userChannels: Set<string>;
}

interface SocketIOClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  channel?: string;
}

class SocketIOServerManager {
  private io: SocketIOServer;
  private clients: Map<string, AuthenticatedSocket> = new Map();
  // Store channels by userId to preserve across reconnects
  private userChannels: Map<string, Set<string>> = new Map();
  // Cache board access checks to avoid race conditions when users are promoted
  // Key: `${userId}:${boardId}`, Value: { hasAccess: boolean, timestamp: number }
  private accessCache: Map<string, { hasAccess: boolean; timestamp: number }> = new Map();
  private readonly ACCESS_CACHE_TTL = 5000; // 5 seconds cache TTL
  // Cache workspaceId lookups to reduce database queries
  // Key: `${table}:${entityId}`, Value: { workspaceId: string, timestamp: number }
  private workspaceIdCache: Map<string, { workspaceId: string; timestamp: number }> = new Map();
  private readonly WORKSPACE_ID_CACHE_TTL = 30000; // 30 seconds cache TTL

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      path: '/socket.io',
      cors: {
        origin: process.env.FRONTEND_URL || '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    this.io.use(async (socket: Socket, next: (err?: Error) => void) => {
      try {
        const token = socket.handshake.auth.token || 
                     socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string; email: string };
        
        // Verify user exists
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, email: true },
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        (socket as AuthenticatedSocket).userId = decoded.userId;
        (socket as AuthenticatedSocket).userChannels = new Set();
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  private async handleConnection(socket: AuthenticatedSocket) {
    const userId = socket.userId;
    console.log(`[Socket.IO] Client connected: ${userId}`);

    // Check if this user already has a connection (reconnect scenario)
    // If so, preserve their channels
    let existingChannels = new Set<string>();
    
    // First, try to get channels from existing Socket.IO connection
    for (const [socketId, existingSocket] of this.clients.entries()) {
      if (existingSocket.userId === userId) {
        // Preserve channels from existing connection
        existingChannels = new Set(existingSocket.userChannels);
        // Remove old connection
        this.clients.delete(socketId);
        try {
          existingSocket.disconnect();
        } catch (e: unknown) {
          // Ignore errors disconnecting old connection
        }
        break;
      }
    }
    
    // If no existing connection found, try to restore from userChannels map
    if (existingChannels.size === 0 && this.userChannels.has(userId)) {
      existingChannels = new Set(this.userChannels.get(userId)!);
    }

    // Store channels in userChannels map for future reconnects
    this.userChannels.set(userId, existingChannels);

    this.clients.set(socket.id, socket);
    socket.userChannels = existingChannels;

    // Restore previous subscriptions
    if (existingChannels.size > 0) {
      for (const channel of existingChannels) {
        socket.join(channel);
        socket.emit('subscribed', { channel });
      }
      console.log(`[Socket.IO] Client ${userId} reconnected (preserved ${existingChannels.size} channels)`);
    }

    // Send connection confirmation
    socket.emit('connected', { message: 'Socket.IO connection established' });

    // Handle subscribe
    socket.on('subscribe', async (data: SocketIOClientMessage) => {
      if (data.channel) {
        await this.handleSubscribe(socket, data.channel);
      }
    });

    // Handle unsubscribe
    socket.on('unsubscribe', (data: SocketIOClientMessage) => {
      if (data.channel) {
        this.handleUnsubscribe(socket, data.channel);
      }
    });

    // Handle ping
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${userId}`);
      this.clients.delete(socket.id);
    });

    // Handle error
    socket.on('error', (error: Error) => {
      console.error(`[Socket.IO] Socket error for ${userId}:`, error);
      this.clients.delete(socket.id);
    });
  }

  private async handleSubscribe(socket: AuthenticatedSocket, channel: string) {
    // Validate channel format
    if (!channel || typeof channel !== 'string') {
      socket.emit('error', { message: 'Invalid channel format', channel });
      return;
    }

    // Access checks are performed during event broadcast, not during subscription
    // This allows subscription but validates access when events are emitted

    // Check workspace access if it's a workspace channel
    if (channel.startsWith('workspace:')) {
      const workspaceId = channel.replace('workspace:', '');
      const hasAccess = await this.checkWorkspaceAccess(socket.userId, workspaceId);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied', channel });
        return;
      }
    }

    // Check board access if it's a board channel
    if (channel.startsWith('board:')) {
      const boardId = channel.replace('board:', '');
      const hasAccess = await this.checkBoardAccess(socket.userId, boardId);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied', channel });
        return;
      }
    }

    socket.join(channel);
    socket.userChannels.add(channel);
    
    // Update userChannels map
    if (!this.userChannels.has(socket.userId)) {
      this.userChannels.set(socket.userId, new Set());
    }
    this.userChannels.get(socket.userId)!.add(channel);

    console.log(`[Socket.IO] Client ${socket.userId} subscribed to ${channel}`);
    socket.emit('subscribed', { channel });
  }

  private handleUnsubscribe(socket: AuthenticatedSocket, channel: string) {
    socket.leave(channel);
    socket.userChannels.delete(channel);
    
    // Update userChannels map
    if (this.userChannels.has(socket.userId)) {
      this.userChannels.get(socket.userId)!.delete(channel);
    }

    console.log(`[Socket.IO] Client ${socket.userId} unsubscribed from ${channel}`);
    socket.emit('unsubscribed', { channel });
  }

  private async checkWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
    try {
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          userId,
        },
      });
      return !!member;
    } catch {
      return false;
    }
  }

  private async checkBoardAccess(userId: string, boardId: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `${userId}:${boardId}`;
    const now = Date.now();
    const cached = this.accessCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < this.ACCESS_CACHE_TTL) {
      return cached.hasAccess;
    }

    try {
      const member = await prisma.boardMember.findFirst({
        where: {
          boardId,
          userId,
        },
      });
      const hasAccess = !!member;
      
      // Update cache
      this.accessCache.set(cacheKey, { hasAccess, timestamp: now });
      return hasAccess;
    } catch {
      return false;
    }
  }

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
      return match ? match[0] : undefined;
    }
    
    return undefined;
  }

  /**
   * Invalidate access cache for a board when membership changes
   */
  invalidateAccessCache(boardId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.accessCache.keys()) {
      if (key.endsWith(`:${boardId}`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.accessCache.delete(key));
  }

  /**
   * Invalidate workspaceId cache for an entity
   */
  invalidateWorkspaceIdCache(entityType: string, entityId: string): void {
    const cacheKey = this.getCacheKey(entityType, entityId);
    this.workspaceIdCache.delete(cacheKey);
  }

  private getCacheKey(entityType: string, entityId: string): string {
    return `${entityType}:${entityId}`;
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Resolve workspaceId with caching
   */
  async resolveWorkspaceId(
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
        // Cache board, column, and card lookups
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
   * Shutdown the server
   */
  shutdown(): void {
    this.io.close();
    this.clients.clear();
    this.userChannels.clear();
    this.accessCache.clear();
    this.workspaceIdCache.clear();
  }
}

let socketIOServer: SocketIOServerManager | null = null;

export function initializeSocketIO(server: HttpServer): SocketIOServerManager {
  if (socketIOServer) {
    return socketIOServer;
  }

  socketIOServer = new SocketIOServerManager(server);
  console.log('[Socket.IO] Server initialized on /socket.io');
  return socketIOServer;
}

export function getSocketIOServer(): SocketIOServerManager | null {
  return socketIOServer;
}

