import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger.js';
import { emitToAudience, emitToBoard, emitToUser, emitToWorkspace, getRealtimeFlags } from '../../utils/socketIO.js';
import { getChangeEventName } from './helpers.js';
import type { ChangeStreamChangeEvent } from './types.js';

export function handleActivityChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
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
    if (change.operationType === 'insert' && boardId) {
      emitToBoard(boardId, 'activity:created', {
        activityId,
        boardId,
        cardId,
        data: change.fullDocument,
        serverTs,
      });
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling activity change');
  }
}

export function handleLabelChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
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
    if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
      if (!boardId) return;
      emitToBoard(boardId, `label:${eventName}`, { labelId, boardId, data: change.fullDocument, serverTs });
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
    } else if (change.operationType === 'delete' && boardId) {
      emitToBoard(boardId, `label:${eventName}`, { labelId, boardId, serverTs });
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling label change');
  }
}

export function handleInviteChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
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
        emitToUser(createdBy, `invite:${eventName}`, { inviteId, data: change.fullDocument, serverTs });
      }
      if (getRealtimeFlags().deltaMode && change.operationType === 'update' && change.updateDescription != null) {
        emitToAudience(
          {
            ...(workspaceId != null ? { workspaceId } : {}),
            ...(boardId != null ? { boardId } : {}),
            userIds: createdBy != null ? [createdBy] : [],
          },
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
        emitToWorkspace(workspaceId, `invite:${eventName}`, { inviteId, workspaceId, boardId, serverTs });
      }
      if (boardId) {
        emitToBoard(boardId, `invite:${eventName}`, { inviteId, boardId, serverTs });
      }
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling invite change');
  }
}
