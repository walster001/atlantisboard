import type { Document } from 'mongoose';
import { List, type IList } from '../models/List.js';
import { Card, type ICard } from '../models/Card.js';
import { Board } from '../models/Board.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { recordBoardActivityDeferred } from './boardActivityTracking.js';
import { hasPermission } from '../utils/permissions.js';
import { createList, updateList } from './listService.js';
import { duplicateCardsBatch } from './cardService/cardDuplication.js';
import { compareCardListOrder } from '../../shared/utils/cardListPos.js';
import { LIST_NAME_MAX_LENGTH } from '../../shared/constants/entityTextLimits.js';
import { getBoardListCardLimits } from './cardService/types.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/domainErrors.js';

export interface DuplicateListResult {
  readonly list: Document & IList;
  readonly cards: readonly (Document & ICard)[];
}

export async function duplicateList(
  sourceListId: string,
  targetBoardId: string,
  userId: string,
): Promise<DuplicateListResult> {
  const sourceList = await List.findById(sourceListId);
  if (sourceList == null) {
    throw new NotFoundError('List not found');
  }

  const sourceBoardId = sourceList.boardId.toString();
  const sourceBoard = await Board.findById(sourceBoardId);
  if (sourceBoard == null) {
    throw new NotFoundError('Board not found');
  }

  if (sourceBoard.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, sourceBoardId, 'lists.duplicate');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to duplicate list');
    }
  }

  const targetBoard = await Board.findById(targetBoardId);
  if (targetBoard == null) {
    throw new NotFoundError('Target board not found');
  }

  if (targetBoard.ownerId.toString() !== userId) {
    const canViewTarget = await hasPermission({ id: userId }, targetBoardId, 'boards.view');
    if (!canViewTarget) {
      throw new ForbiddenError('Insufficient permissions to view target board');
    }
    const canCreateList = await hasPermission({ id: userId }, targetBoardId, 'lists.create');
    if (!canCreateList) {
      throw new ForbiddenError('Insufficient permissions to create list on target board');
    }
  }

  const listName = sourceList.name.trim().slice(0, LIST_NAME_MAX_LENGTH);

  const newList = await createList(
    {
      boardId: targetBoardId,
      name: listName,
    },
    userId,
  );

  if (typeof sourceList.color === 'string' && sourceList.color.trim() !== '') {
    await updateList(newList._id.toString(), { color: sourceList.color }, userId);
  }

  const sourceCards = await Card.find({ listId: sourceListId }).lean();
  const sortedSourceCards = [...sourceCards].sort((a, b) =>
    compareCardListOrder(
      {
        ...(typeof a.pos === 'number' && Number.isFinite(a.pos) ? { pos: a.pos } : {}),
        position: a.position,
        id: a._id.toString(),
      },
      {
        ...(typeof b.pos === 'number' && Number.isFinite(b.pos) ? { pos: b.pos } : {}),
        position: b.position,
        id: b._id.toString(),
      },
    ),
  );

  const { max, enforce } = getBoardListCardLimits(targetBoard);
  if (enforce && sortedSourceCards.length > max) {
    throw new ValidationError(`Target list cannot exceed maximum card limit of ${max}`);
  }

  const cardsToCopy =
    enforce && sortedSourceCards.length > max ? sortedSourceCards.slice(0, max) : sortedSourceCards;

  const newListId = newList._id.toString();

  const createdCards = await duplicateCardsBatch(cardsToCopy, newListId, userId, {
    skipSourcePermissionCheck: true,
    skipAudit: true,
    skipActivities: true,
    sourceBoardIdForSocket: sourceBoardId,
  });

  logAuditEvent({
    userId,
    action: 'list.duplicate',
    resourceType: 'list',
    resourceId: sourceListId,
    metadata: {
      duplicatedListId: newListId,
      targetBoardId,
      cardCount: cardsToCopy.length,
    },
    timestamp: new Date(),
  });

  recordBoardActivityDeferred({
    boardId: targetBoardId,
    userId,
    category: 'lists',
    type: 'list.duplicated',
    description: `List "${listName}" duplicated`,
    metadata: {
      entityId: newListId,
      entityName: listName,
      previous: sourceListId,
    },
    boardSettings: targetBoard.settings,
  });

  const refreshed = await List.findById(newListId);
  if (refreshed == null) {
    throw new NotFoundError('Duplicated list not found after create');
  }
  return { list: refreshed, cards: createdCards };
}
