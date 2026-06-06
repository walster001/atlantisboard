import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt.js';
import { extractTokenFromHandshake } from '../middleware/auth.js';
import { hasPermission, isWorkspaceMember } from '../utils/permissions.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { setupChangeStreams } from './changeStreams.js';
import { setSocketIOInstance } from '../utils/socketIO.js';
import { isAllowedCorsOrigin } from '../config/cors.js';
import { getAdminMonitorRoom } from '../services/systemMetricsService.js';

export interface SocketAuthData {
  userId: string;
  email: string;
  username: string;
}

export function setupSocketIO(httpServer: HTTPServer): SocketIOServer {
  const compressionThresholdRaw = Number(process.env.REALTIME_COMPRESSION_THRESHOLD_BYTES ?? '1024');
  const compressionThreshold = Number.isFinite(compressionThresholdRaw) ? Math.max(256, compressionThresholdRaw) : 1024;

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin(origin, callback) {
        callback(null, isAllowedCorsOrigin(origin));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    httpCompression: true,
    perMessageDeflate: {
      threshold: compressionThreshold,
    },
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token =
        extractTokenFromHandshake(
          socket.handshake.auth?.token,
          socket.handshake.headers?.authorization,
          socket.handshake.headers?.cookie,
        ) ?? null;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = await verifyToken(token);
      if (!payload) {
        return next(new Error('Invalid or expired token'));
      }

      const user = await User.findById(payload.userId);
      if (!user) {
        return next(new Error('User not found'));
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return next(new Error('Account is locked'));
      }

      socket.data.user = {
        userId: user._id.toString(),
        email: user.email,
        username: user.username,
      } as SocketAuthData;

      next();
    } catch (error) {
      logger.error({ error }, 'Socket.io authentication error');
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const typingThrottleByCard = new Map<string, number>();
    const TYPING_THROTTLE_MS = Math.max(100, Number(process.env.REALTIME_TYPING_THROTTLE_MS ?? 300));

    const emitTyping = async (
      typing: boolean,
      data: { boardId: string; cardId?: string },
    ): Promise<void> => {
      const boardId = typeof data.boardId === 'string' ? data.boardId.trim() : '';
      if (boardId === '') {
        return;
      }
      const allowed = await hasPermission({ id: user.userId }, boardId, 'boards.view');
      if (!allowed) {
        logger.warn({ userId: user.userId, boardId }, 'Denied typing indicator emit');
        return;
      }
      const cardId = typeof data.cardId === 'string' && data.cardId.trim() !== '' ? data.cardId.trim() : undefined;
      const throttleKey = `${boardId}:${cardId ?? '*'}`;
      const now = Date.now();
      const lastSent = typingThrottleByCard.get(throttleKey) ?? 0;
      if (typing && now - lastSent < TYPING_THROTTLE_MS) {
        return;
      }
      typingThrottleByCard.set(throttleKey, now);
      socket.to(`board:${boardId}`).emit('user:typing', {
        userId: user.userId,
        username: user.username,
        ...(cardId != null ? { cardId } : {}),
        typing,
      });
    };

    const user = socket.data.user as SocketAuthData;
    logger.info({ userId: user.userId, socketId: socket.id }, 'Socket.io client connected');

    // Join user-specific room for notifications
    socket.join(`user:${user.userId}`);

    // Handle workspace room joins
    socket.on('workspace:join', async (workspaceId: string) => {
      try {
        const id = typeof workspaceId === 'string' ? workspaceId.trim() : '';
        if (id === '') {
          return;
        }
        // Membership only (same bar as loading a workspace over HTTP). Role permission sets may
        // omit `workspaces.view` for custom roles while the user is still a listed member.
        const allowed = await isWorkspaceMember(user.userId, id);
        if (!allowed) {
          logger.warn({ userId: user.userId, workspaceId: id }, 'Denied workspace:join');
          return;
        }
        socket.join(`workspace:${id}`);
        logger.debug({ userId: user.userId, workspaceId: id }, 'User joined workspace room');
      } catch (error) {
        logger.error({ error, userId: user.userId }, 'workspace:join handler error');
      }
    });

    // Handle workspace room leaves
    socket.on('workspace:leave', (workspaceId: string) => {
      socket.leave(`workspace:${workspaceId}`);
      logger.debug({ userId: user.userId, workspaceId }, 'User left workspace room');
    });

    // Handle board room joins
    socket.on('board:join', async (boardId: string) => {
      try {
        const id = typeof boardId === 'string' ? boardId.trim() : '';
        if (id === '') {
          return;
        }
        const allowed = await hasPermission({ id: user.userId }, id, 'boards.view');
        if (!allowed) {
          logger.warn({ userId: user.userId, boardId: id }, 'Denied board:join');
          return;
        }
        socket.join(`board:${id}`);
        logger.debug({ userId: user.userId, boardId: id }, 'User joined board room');

        socket.to(`board:${id}`).emit('user:joined', {
          userId: user.userId,
          username: user.username,
          boardId: id,
        });
      } catch (error) {
        logger.error({ error, userId: user.userId }, 'board:join handler error');
      }
    });

    // Handle board room leaves
    socket.on('board:leave', (boardId: string) => {
      socket.leave(`board:${boardId}`);
      logger.debug({ userId: user.userId, boardId }, 'User left board room');

      // Notify others in the room
      socket.to(`board:${boardId}`).emit('user:left', {
        userId: user.userId,
        username: user.username,
        boardId,
      });
    });

    // Handle typing indicators (for comments)
    socket.on('comment:typing', (data: { boardId: string; cardId?: string }) => {
      void emitTyping(true, data).catch((error: unknown) => {
        logger.error({ error, userId: user.userId }, 'comment:typing handler error');
      });
    });

    socket.on('comment:typing:stop', (data: { boardId: string; cardId?: string }) => {
      void emitTyping(false, data).catch((error: unknown) => {
        logger.error({ error, userId: user.userId }, 'comment:typing:stop handler error');
      });
    });

    // Legacy typing events (for backwards compatibility)
    socket.on('typing:start', (data: { boardId: string; cardId?: string }) => {
      void emitTyping(true, data).catch((error: unknown) => {
        logger.error({ error, userId: user.userId }, 'typing:start handler error');
      });
    });

    socket.on('typing:stop', (data: { boardId: string; cardId?: string }) => {
      void emitTyping(false, data).catch((error: unknown) => {
        logger.error({ error, userId: user.userId }, 'typing:stop handler error');
      });
    });

    socket.on('admin:monitor:subscribe', async () => {
      try {
        const adminUser = await User.findById(user.userId).select('isAppAdmin').lean();
        if (adminUser?.isAppAdmin !== true) {
          logger.warn({ userId: user.userId }, 'Denied admin:monitor:subscribe (not app admin)');
          return;
        }
        socket.join(getAdminMonitorRoom());
        logger.debug({ userId: user.userId }, 'User joined admin:monitor room');
      } catch (error) {
        logger.error({ error, userId: user.userId }, 'admin:monitor:subscribe handler error');
      }
    });

    socket.on('admin:monitor:unsubscribe', () => {
      socket.leave(getAdminMonitorRoom());
      logger.debug({ userId: user.userId }, 'User left admin:monitor room');
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      typingThrottleByCard.clear();
      logger.info({ userId: user.userId, socketId: socket.id }, 'Socket.io client disconnected');
      
      // Get all rooms the socket was in and notify of disconnection
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => {
        if (room.startsWith('board:')) {
          const boardId = room.replace('board:', '');
          socket.to(room).emit('user:left', {
            userId: user.userId,
            username: user.username,
            boardId,
          });
        } else if (room.startsWith('workspace:')) {
          const workspaceId = room.replace('workspace:', '');
          socket.to(room).emit('user:left', {
            userId: user.userId,
            username: user.username,
            workspaceId,
          });
        }
      });
    });
  });

  // Setup MongoDB Change Streams
  setupChangeStreams(io).catch((error) => {
    logger.error({ error }, 'Failed to setup MongoDB Change Streams');
  });

  // Store io instance for use in routes/services
  setSocketIOInstance(io);

  logger.info('Socket.io server initialized');
  return io;
}

