import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt.js';
import { hasPermission, isWorkspaceMember } from '../utils/permissions.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { setupChangeStreams } from './changeStreams.js';
import { setSocketIOInstance } from '../utils/socketIO.js';

export interface SocketAuthData {
  userId: string;
  email: string;
  username: string;
}

export function setupSocketIO(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = verifyToken(token);
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
      socket.to(`board:${data.boardId}`).emit('user:typing', {
        userId: user.userId,
        username: user.username,
        cardId: data.cardId,
        typing: true,
      });
    });

    socket.on('comment:typing:stop', (data: { boardId: string; cardId?: string }) => {
      socket.to(`board:${data.boardId}`).emit('user:typing', {
        userId: user.userId,
        username: user.username,
        cardId: data.cardId,
        typing: false,
      });
    });

    // Legacy typing events (for backwards compatibility)
    socket.on('typing:start', (data: { boardId: string; cardId?: string }) => {
      socket.to(`board:${data.boardId}`).emit('user:typing', {
        userId: user.userId,
        username: user.username,
        cardId: data.cardId,
        typing: true,
      });
    });

    socket.on('typing:stop', (data: { boardId: string; cardId?: string }) => {
      socket.to(`board:${data.boardId}`).emit('user:typing', {
        userId: user.userId,
        username: user.username,
        cardId: data.cardId,
        typing: false,
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
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

