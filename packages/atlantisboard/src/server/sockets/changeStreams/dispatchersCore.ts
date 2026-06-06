import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger.js';
import { Card } from '../../models/Card.js';
import { emitWorkspaceUpdatedToBoardScopedUsersById } from '../../services/workspaceService.js';
import { emitToAudience, emitToBoard, emitToUser, emitToWorkspace, getRealtimeFlags } from '../../utils/socketIO.js';
import { getChangeEventName } from './helpers.js';
import type { ChangeStreamChangeEvent } from './types.js';

export function handleWorkspaceChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
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
      emitToWorkspace(workspaceId, `workspace:${eventName}`, { workspaceId, data: change.fullDocument, serverTs });
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
      emitToWorkspace(workspaceId, `workspace:${eventName}`, { workspaceId, serverTs });
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling workspace change');
  }
}

export function handleBoardChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
  try {
    void io;
    if (getRealtimeFlags().singleSourceMode) {
      return;
    }
    const boardId = change.documentKey?._id?.toString();
    if (!boardId) return;
    const eventName = getChangeEventName(change.operationType || '');
    const serverTs = Date.now();

    if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
      emitToBoard(boardId, `board:${eventName}`, { boardId, data: change.fullDocument, serverTs });
      const boardDoc = change.fullDocument as
        | { workspaceId?: unknown; ownerId?: unknown; members?: Array<{ userId?: unknown }> }
        | undefined;
      const workspaceId = boardDoc?.workspaceId?.toString();
      if (workspaceId) {
        emitToWorkspace(workspaceId, `board:${eventName}`, { boardId, data: change.fullDocument, serverTs });
      }
      const ownerId = boardDoc?.ownerId?.toString();
      if (ownerId) {
        emitToUser(ownerId, `board:${eventName}`, { boardId, data: change.fullDocument, serverTs });
      }
      const members = boardDoc?.members ?? [];
      for (const m of members) {
        const memberUserId = m?.userId?.toString();
        if (memberUserId && memberUserId !== ownerId) {
          emitToUser(memberUserId, `board:${eventName}`, { boardId, data: change.fullDocument, serverTs });
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
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling board change');
  }
}

export function handleListChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
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
    } else if (change.operationType === 'delete' && boardIdFromDocument) {
      emitToBoard(boardIdFromDocument, `list:${eventName}`, { listId, boardId: boardIdFromDocument, serverTs });
    }
  } catch (error) {
    logger.error({ error, change }, 'Error handling list change');
  }
}

export function handleCardChange(change: ChangeStreamChangeEvent<unknown>, io: SocketIOServer): void {
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
        const fullCard = change.fullDocument ?? (await Card.findById(cardId).lean().exec());
        if (!fullCard) return;
        const boardId = (fullCard as { boardId?: unknown })?.boardId?.toString();
        if (!boardId) {
          return;
        }
        const eventName = getChangeEventName(change.operationType || '');
        emitToBoard(boardId, `card:${eventName}`, { cardId, boardId, data: fullCard, serverTs });
        return;
      }
      if (change.operationType === 'update') {
        const fullCard = change.fullDocument ?? (await Card.findById(cardId).select('boardId').lean().exec());
        if (!fullCard) return;
        const boardId = (fullCard as { boardId?: unknown })?.boardId?.toString();
        if (!boardId) return;
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
          const fullCardWithFields = change.fullDocument ?? (await Card.findById(cardId).lean().exec());
          if (fullCardWithFields != null) {
            emitToBoard(boardId, 'card:updated', { cardId, boardId, data: fullCardWithFields, serverTs });
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
      }
    } catch (error) {
      logger.error({ error, change }, 'Error handling card change');
    }
  })();
}
