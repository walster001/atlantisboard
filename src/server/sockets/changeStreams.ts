import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { MongoServerError } from 'mongodb';
import { logger } from '../utils/logger.js';
import { Workspace } from '../models/Workspace.js';
import { Board } from '../models/Board.js';
import { List } from '../models/List.js';
import { Card } from '../models/Card.js';
import { Activity } from '../models/Activity.js';
import { BoardLabel } from '../models/BoardLabel.js';
import { InviteLink } from '../models/InviteLink.js';
import { emitWorkspaceUpdatedToBoardScopedUsersById } from '../services/workspaceService.js';
import { emitToAudience, emitToBoard, emitToUser, emitToWorkspace, getRealtimeFlags } from '../utils/socketIO.js';

type ChangeStreamChangeEvent<T = unknown> = {
  operationType?: 'insert' | 'update' | 'replace' | 'delete' | 'invalidate' | 'drop' | 'dropDatabase' | 'rename' | null;
  documentKey?: { _id: mongoose.Types.ObjectId };
  fullDocument?: T;
  updateDescription?: {
    updatedFields?: Record<string, unknown>;
    removedFields?: string[];
  };
};

// Store change streams for cleanup
const changeStreams: Array<{ close: () => Promise<void> }> = [];

let changeStreamReplicaSetErrorLogged = false;

function isChangeStreamReplicaSetError(err: unknown): boolean {
  return (
    err instanceof MongoServerError &&
    (err.code === 40573 || err.codeName === 'Location40573')
  );
}

/**
 * Change Streams need a replica set; standalone MongoDB returns 40573.
 * - DISABLE_CHANGE_STREAMS=true → never run
 * - ENABLE_CHANGE_STREAMS=true|false → explicit
 * - Otherwise: on in production only (backward compatible); off in development (avoids standalone noise)
 */
function shouldRunChangeStreams(): boolean {
  const dis = process.env.DISABLE_CHANGE_STREAMS?.trim().toLowerCase();
  if (dis === 'true' || dis === '1' || dis === 'yes') {
    return false;
  }
  const en = process.env.ENABLE_CHANGE_STREAMS?.trim().toLowerCase();
  if (en === 'true' || en === '1' || en === 'yes') {
    return true;
  }
  if (en === 'false' || en === '0' || en === 'no') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

function attachChangeStreamErrorHandler(
  stream: { on: (ev: 'error', fn: (err: unknown) => void) => void },
  label: string
): void {
  stream.on('error', (err: unknown) => {
    if (isChangeStreamReplicaSetError(err)) {
      if (!changeStreamReplicaSetErrorLogged) {
        changeStreamReplicaSetErrorLogged = true;
        logger.warn(
          'MongoDB Change Streams stopped: $changeStream requires a replica set (40573). Use Atlas or rs.initiate(), or set ENABLE_CHANGE_STREAMS=false.'
        );
        void Promise.all(
          changeStreams.map((s) => s.close().catch(() => undefined))
        ).then(() => {
          changeStreams.length = 0;
        });
      }
      return;
    }
    logger.error({ err, label }, 'Change stream error');
  });
}

export async function setupChangeStreams(io: SocketIOServer): Promise<void> {
  if (!shouldRunChangeStreams()) {
    const dis = process.env.DISABLE_CHANGE_STREAMS?.trim().toLowerCase();
    const en = process.env.ENABLE_CHANGE_STREAMS?.trim().toLowerCase();
    if (dis === 'true' || dis === '1' || dis === 'yes') {
      logger.info('MongoDB Change Streams skipped (DISABLE_CHANGE_STREAMS)');
    } else if (en === 'false' || en === '0' || en === 'no') {
      logger.info('MongoDB Change Streams skipped (ENABLE_CHANGE_STREAMS=false)');
    } else if (process.env.NODE_ENV !== 'production') {
      logger.info(
        'MongoDB Change Streams skipped (non-production default; set ENABLE_CHANGE_STREAMS=true with a replica set to enable)'
      );
    } else {
      logger.info('MongoDB Change Streams skipped');
    }
    return;
  }

  // Socket.io is initialized at module load; MongoDB may still be connecting (async).
  // Wait for the driver before Model.watch(), otherwise mongoose.connection.db is undefined.
  try {
    await mongoose.connection.asPromise();
  } catch (error) {
    logger.error({ error }, 'Cannot initialize Change Streams: MongoDB connection failed');
    return;
  }

  if (!mongoose.connection.db) {
    logger.warn('Database connection not available for Change Streams');
    return;
  }

  try {
    const commonPipeline = [
      {
        $match: {
          operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
        },
      },
    ];

    // Workspace Change Stream
    const workspaceStream = Workspace.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(workspaceStream, 'Workspace');
    workspaceStream.on('change', (change) => {
      handleWorkspaceChange(change, io);
    });
    changeStreams.push(workspaceStream);

    // Board Change Stream
    const boardStream = Board.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(boardStream, 'Board');
    boardStream.on('change', (change) => {
      handleBoardChange(change, io);
    });
    changeStreams.push(boardStream);

    // List Change Stream
    const listStream = List.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(listStream, 'List');
    listStream.on('change', (change) => {
      handleListChange(change, io);
    });
    changeStreams.push(listStream);

    // Card Change Stream
    const cardStream = Card.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(cardStream, 'Card');
    cardStream.on('change', (change) => {
      handleCardChange(change, io);
    });
    changeStreams.push(cardStream);

    // Activity Change Stream
    const activityStream = Activity.watch([{ $match: { operationType: 'insert' } }], { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(activityStream, 'Activity');
    activityStream.on('change', (change) => {
      handleActivityChange(change, io);
    });
    changeStreams.push(activityStream);

    // BoardLabel Change Stream
    const labelStream = BoardLabel.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(labelStream, 'BoardLabel');
    labelStream.on('change', (change) => {
      handleLabelChange(change, io);
    });
    changeStreams.push(labelStream);

    // InviteLink Change Stream
    const inviteStream = InviteLink.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(inviteStream, 'InviteLink');
    inviteStream.on('change', (change) => {
      handleInviteChange(change, io);
    });
    changeStreams.push(inviteStream);

    logger.info('MongoDB Change Streams initialized');
  } catch (error) {
    if (isChangeStreamReplicaSetError(error)) {
      logger.warn(
        'MongoDB Change Streams not available: replica set required (40573). Set ENABLE_CHANGE_STREAMS=false or use a replica set.'
      );
      return;
    }
    logger.error({ error }, 'Error setting up MongoDB Change Streams');
    throw error;
  }
}

// Backward-compatible alias for tests and older imports.
export const initializeChangeStreams = setupChangeStreams;

/**
 * Close all change streams to prevent memory leaks
 */
export async function closeChangeStreams(): Promise<void> {
  await Promise.all(changeStreams.map((stream) => stream.close().catch((error) => {
    logger.error({ error }, 'Error closing change stream');
  })));
  changeStreams.length = 0;
  logger.info('All change streams closed');
}

function handleWorkspaceChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const workspaceId = change.documentKey?._id?.toString();
    if (!workspaceId) return;

    const eventName = getChangeEventName(change.operationType || '');
    const serverTs = Date.now();

    if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
      emitToWorkspace(workspaceId, `workspace:${eventName}`, {
        workspaceId,
        data: change.fullDocument,
        serverTs,
      });
      if (getRealtimeFlags().deltaMode && change.operationType === 'update' && change.updateDescription != null) {
        emitToWorkspace(workspaceId, 'workspace:patched', {
          workspaceId,
          changedFields: change.updateDescription.updatedFields ?? {},
          removedFields: change.updateDescription.removedFields ?? [],
          serverTs,
          version: 2,
        });
      }
      if (change.operationType === 'update' || change.operationType === 'replace') {
        void emitWorkspaceUpdatedToBoardScopedUsersById(workspaceId);
      }
    } else if (change.operationType === 'delete') {
      emitToWorkspace(workspaceId, `workspace:${eventName}`, {
        workspaceId,
        serverTs,
      });
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling workspace change');
  }
}

function handleBoardChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const boardId = change.documentKey?._id?.toString();
    if (!boardId) return;

    const eventName = getChangeEventName(change.operationType || '');
    const serverTs = Date.now();

    // Emit to board-specific room
    if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
      emitToBoard(boardId, `board:${eventName}`, {
        boardId,
        data: change.fullDocument,
        serverTs,
      });

      // Also emit to workspace room for home/workspace views
      const boardDoc = change.fullDocument as
        | { workspaceId?: unknown; ownerId?: unknown; members?: Array<{ userId?: unknown }> }
        | undefined;
      const workspaceId = boardDoc?.workspaceId?.toString();
      if (workspaceId) {
        emitToWorkspace(workspaceId, `board:${eventName}`, {
          boardId,
          data: change.fullDocument,
          serverTs,
        });
      }

      // Also emit to affected user rooms (owner + members) for personal/home buckets
      const ownerId = boardDoc?.ownerId?.toString();
      if (ownerId) {
        emitToUser(ownerId, `board:${eventName}`, {
          boardId,
          data: change.fullDocument,
          serverTs,
        });
      }
      const members = boardDoc?.members ?? [];
      for (const m of members) {
        const memberUserId = m?.userId?.toString();
        if (memberUserId && memberUserId !== ownerId) {
          emitToUser(memberUserId, `board:${eventName}`, {
            boardId,
            data: change.fullDocument,
            serverTs,
          });
        }
      }
      if (getRealtimeFlags().deltaMode && change.operationType === 'update' && change.updateDescription != null) {
        emitToAudience(
          {
            boardId,
            ...(workspaceId != null ? { workspaceId } : {}),
            userIds: [
              ...(ownerId != null ? [ownerId] : []),
              ...members.map((member) => member?.userId?.toString() ?? '').filter((value) => value !== ownerId && value !== ''),
            ],
          },
          'board:patched',
          {
            boardId,
            changedFields: change.updateDescription.updatedFields ?? {},
            removedFields: change.updateDescription.removedFields ?? [],
            serverTs,
            version: 2,
          },
        );
      }
    } else if (change.operationType === 'delete') {
      // board:deleted is emitted directly by services where workspace/user rooms are known.
      return;
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling board change');
  }
}

function handleListChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const listId = change.documentKey?._id?.toString();
    if (!listId) return;
    const boardIdFromDocument = (change.fullDocument as { boardId?: unknown } | undefined)?.boardId?.toString();

    const eventName = getChangeEventName(change.operationType || '');
    const serverTs = Date.now();

    // Emit to board-specific room
    if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
      if (!boardIdFromDocument) return;
      emitToBoard(boardIdFromDocument, `list:${eventName}`, {
        listId,
        boardId: boardIdFromDocument,
        data: change.fullDocument,
        serverTs,
      });
      if (getRealtimeFlags().deltaMode && change.operationType === 'update' && change.updateDescription != null) {
        emitToBoard(boardIdFromDocument, 'list:patched', {
          listId,
          boardId: boardIdFromDocument,
          changedFields: change.updateDescription.updatedFields ?? {},
          removedFields: change.updateDescription.removedFields ?? [],
          serverTs,
          version: 2,
        });
      }
    } else if (change.operationType === 'delete') {
      // list delete emits stay service-owned when boardId is not available in stream payload.
      if (boardIdFromDocument) {
        emitToBoard(boardIdFromDocument, `list:${eventName}`, {
          listId,
          boardId: boardIdFromDocument,
          serverTs,
        });
      }
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling list change');
  }
}

function handleCardChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  void (async () => {
    try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const cardId = change.documentKey?._id?.toString();
    if (!cardId) return;
    const serverTs = Date.now();

    if (change.operationType === 'insert' || change.operationType === 'replace') {
      const fullCard =
        change.fullDocument ??
        (await Card.findById(cardId).lean().exec());
      if (!fullCard) return;
      const boardId = (fullCard as { boardId?: unknown })?.boardId?.toString();
      if (!boardId) {
        return;
      }
      const eventName = getChangeEventName(change.operationType || '');
      emitToBoard(boardId, `card:${eventName}`, {
        cardId,
        boardId,
        data: fullCard,
        serverTs,
      });
      return;
    }

    if (change.operationType === 'update') {
      const fullCard =
        change.fullDocument ??
        (await Card.findById(cardId).select('boardId').lean().exec());
      if (!fullCard) {
        return;
      }
      const boardId = (fullCard as { boardId?: unknown })?.boardId?.toString();
      if (!boardId) {
        return;
      }
      const updatedFields = change.updateDescription?.updatedFields ?? {};
      const changedFields: Record<string, unknown> = {};
      for (const key of Object.keys(updatedFields)) {
        const topLevelKey = key.split('.')[0];
        if (topLevelKey === undefined || topLevelKey === '') {
          continue;
        }
        changedFields[topLevelKey] = updatedFields[key];
      }
      if (!getRealtimeFlags().deltaMode) {
        const fullCardWithFields =
          change.fullDocument ??
          (await Card.findById(cardId).lean().exec());
        if (fullCardWithFields != null) {
          emitToBoard(boardId, 'card:updated', {
            cardId,
            boardId,
            data: fullCardWithFields,
            serverTs,
          });
        }
        return;
      }
      emitToBoard(boardId, 'card:patched', {
        cardId,
        boardId,
        changedFields,
        removedFields: change.updateDescription?.removedFields ?? [],
        serverTs,
        version: 2,
      });
      return;
    }

    if (change.operationType === 'delete') {
      // card:deleted is emitted directly by services where boardId is known.
      return;
    }
    } catch (error) {
      logger.error({ error, change }, 'Error handling card change');
    }
  })();
}

function handleActivityChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const activityId = change.documentKey?._id?.toString();
    if (!activityId || !change.fullDocument) return;

    const activity = change.fullDocument as { boardId?: unknown; cardId?: unknown };
    const boardId = activity.boardId?.toString();
    const cardId = activity.cardId?.toString();
    const serverTs = Date.now();

    if (change.operationType === 'insert') {
      // Emit to board room if boardId exists
      if (boardId) {
        emitToBoard(boardId, 'activity:created', {
          activityId,
          boardId,
          cardId,
          data: change.fullDocument,
          serverTs,
        });
      }
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling activity change');
  }
}

function handleLabelChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const labelId = change.documentKey?._id?.toString();
    if (!labelId) return;
    const label = change.fullDocument as { boardId?: unknown } | undefined;
    const boardId = label?.boardId?.toString();

    const eventName = getChangeEventName(change.operationType || '');
    const serverTs = Date.now();

    // Emit to board-specific room
    if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
      if (!boardId) return;
      emitToBoard(boardId, `label:${eventName}`, {
        labelId,
        boardId,
        data: change.fullDocument,
        serverTs,
      });
      if (getRealtimeFlags().deltaMode && change.operationType === 'update' && change.updateDescription != null) {
        emitToBoard(boardId, 'label:patched', {
          labelId,
          boardId,
          changedFields: change.updateDescription.updatedFields ?? {},
          removedFields: change.updateDescription.removedFields ?? [],
          serverTs,
          version: 2,
        });
      }
    } else if (change.operationType === 'delete') {
      if (boardId) {
        emitToBoard(boardId, `label:${eventName}`, {
          labelId,
          boardId,
          serverTs,
        });
      }
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling label change');
  }
}

function handleInviteChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const inviteId = change.documentKey?._id?.toString();
    if (!inviteId) return;

    const invite = change.fullDocument as { workspaceId?: unknown; boardId?: unknown; createdBy?: unknown } | undefined;
    const workspaceId = invite?.workspaceId?.toString();
    const boardId = invite?.boardId?.toString();
    const createdBy = invite?.createdBy?.toString();

    const eventName = getChangeEventName(change.operationType || '');
    const serverTs = Date.now();

    // Emit to workspace or board room, and to creator
    if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
      if (workspaceId) {
        emitToWorkspace(workspaceId, `invite:${eventName}`, {
          inviteId,
          workspaceId,
          boardId,
          data: change.fullDocument,
          serverTs,
        });
      }
      if (boardId) {
        emitToBoard(boardId, `invite:${eventName}`, {
          inviteId,
          boardId,
          data: change.fullDocument,
          serverTs,
        });
      }
      if (createdBy) {
        emitToUser(createdBy, `invite:${eventName}`, {
          inviteId,
          data: change.fullDocument,
          serverTs,
        });
      }
      if (getRealtimeFlags().deltaMode && change.operationType === 'update' && change.updateDescription != null) {
        emitToAudience(
          { ...(workspaceId != null ? { workspaceId } : {}), ...(boardId != null ? { boardId } : {}), userIds: createdBy != null ? [createdBy] : [] },
          'invite:patched',
          {
            inviteId,
            ...(workspaceId != null ? { workspaceId } : {}),
            ...(boardId != null ? { boardId } : {}),
            changedFields: change.updateDescription.updatedFields ?? {},
            removedFields: change.updateDescription.removedFields ?? [],
            serverTs,
            version: 2,
          },
        );
      }
    } else if (change.operationType === 'delete') {
      if (workspaceId) {
        emitToWorkspace(workspaceId, `invite:${eventName}`, {
          inviteId,
          workspaceId,
          boardId,
          serverTs,
        });
      }
      if (boardId) {
        emitToBoard(boardId, `invite:${eventName}`, {
          inviteId,
          boardId,
          serverTs,
        });
      }
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling invite change');
  }
}

function getChangeEventName(operationType: string): string {
  switch (operationType) {
    case 'insert':
      return 'created';
    case 'update':
    case 'replace':
      return 'updated';
    case 'delete':
      return 'deleted';
    default:
      return 'changed';
  }
}

