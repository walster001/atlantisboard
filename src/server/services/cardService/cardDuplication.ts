import { type Document } from 'mongoose';
import {
  Card,
  type ICard,
  type ICardAttachment,
  type ICardComment,
  type ICardReminder,
  type IChecklist,
} from '../../models/Card.js';
import { List } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { createActivity } from '../activityService.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToBoard } from '../../utils/socketIO.js';
import { duplicateCardAttachmentsForNewCard } from '../attachmentService.js';
import {
  cardCoverReferencesAttachment,
  extractAttachmentIdFromMediaSrc,
  remapAttachmentRefsInDescriptionHtmlString,
  remapAttachmentRefsInDescriptionJsonString,
} from '../../../shared/cardDescriptionAttachmentRefs.js';
import { CARD_TITLE_MAX_LENGTH } from '../../../shared/constants/entityTextLimits.js';
import {
  CARD_POS_STEP,
  insertPosBetween,
  posGapTooSmall,
  posNeedsNormalize,
} from '../../../shared/utils/cardListPos.js';
import {
  ensureCardsHavePosForList,
  normalizeListPosSpread,
  sortCardRowsByPos,
  syncListPositionsFromPosOrder,
  type CardPosLeanRow,
} from './positioning.js';
import { getBoardListCardLimits } from './types.js';

function cloneCardComments(comments: readonly ICardComment[] | undefined): ICardComment[] {
  if (comments == null || comments.length === 0) {
    return [];
  }
  return comments.map((c) => ({
    id: crypto.randomUUID(),
    userId: c.userId,
    text: c.text,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  }));
}

function cloneChecklistsForDuplicate(checklists: readonly IChecklist[] | undefined): IChecklist[] {
  if (checklists == null || checklists.length === 0) {
    return [];
  }
  return checklists.map((checklist) => ({
    id: crypto.randomUUID(),
    title: checklist.title,
    items: checklist.items.map((item) => ({
      id: crypto.randomUUID(),
      text: item.text,
      completed: false,
      ...(item.sortOrder != null ? { sortOrder: item.sortOrder } : {}),
    })),
  }));
}

function cloneRemindersForDuplicate(reminders: readonly ICardReminder[] | undefined): ICardReminder[] {
  if (reminders == null || reminders.length === 0) {
    return [];
  }
  return reminders.map((r) => ({
    id: crypto.randomUUID(),
    triggerAt: new Date(r.triggerAt),
    ...(r.repeatFrequency != null && String(r.repeatFrequency).trim() !== ''
      ? { repeatFrequency: r.repeatFrequency }
      : {}),
    sent: false,
    dismissed: false,
  }));
}

/** When cover referenced a copied attachment, point it at the new row (URL or `/attachments/:id/file`). */
function remapCoverForDuplicate(
  sourceCover: string | undefined | null,
  sourceAttachments: readonly ICardAttachment[],
  newAttachments: readonly ICardAttachment[],
): string | undefined {
  if (sourceCover == null || typeof sourceCover !== 'string' || sourceCover.trim() === '') {
    return undefined;
  }
  const raw = sourceCover.trim();
  const extracted = extractAttachmentIdFromMediaSrc(raw);
  if (extracted != null) {
    const idx = sourceAttachments.findIndex((a) => a.id === extracted);
    if (idx >= 0 && newAttachments[idx] != null && sourceAttachments[idx]?.id === extracted) {
      const newId = newAttachments[idx]!.id;
      let next = raw.split(encodeURIComponent(extracted)).join(encodeURIComponent(newId));
      if (next === raw) {
        next = raw.split(extracted).join(newId);
      }
      return next;
    }
  }
  for (let i = 0; i < sourceAttachments.length; i += 1) {
    const oldA = sourceAttachments[i];
    const newA = newAttachments[i];
    if (oldA != null && newA != null && cardCoverReferencesAttachment(raw, oldA.id, oldA.url)) {
      return newA.url;
    }
  }
  return raw;
}

async function computeInsertPosAtTopOfList(listId: string): Promise<number> {
  await ensureCardsHavePosForList(listId);
  const rowNumericPos = (r: CardPosLeanRow): number =>
    typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : (r.position + 1) * CARD_POS_STEP;

  const loadNeighbors = async (): Promise<CardPosLeanRow[]> =>
    sortCardRowsByPos(
      await Card.find({ listId }).select('pos position').lean<CardPosLeanRow[]>(),
    );

  let neighbors = await loadNeighbors();
  let neighborPos = neighbors.map(rowNumericPos);
  if (neighborPos.length >= 2 && posNeedsNormalize(neighborPos)) {
    await normalizeListPosSpread(listId);
    neighbors = await loadNeighbors();
    neighborPos = neighbors.map(rowNumericPos);
  }

  const before: number | null = null;
  const after = neighborPos.length > 0 ? neighborPos[0]! : null;
  let newPos = insertPosBetween(before, after);
  if (posGapTooSmall(before, after)) {
    await normalizeListPosSpread(listId);
    neighbors = await loadNeighbors();
    neighborPos = neighbors.map(rowNumericPos);
    newPos = insertPosBetween(null, neighborPos.length > 0 ? neighborPos[0]! : null);
  }
  return newPos;
}

export interface DuplicateCardOptions {
  /** Used when duplicating cards as part of `lists.duplicate` (permission already checked). */
  readonly skipSourcePermissionCheck?: boolean;
}

export async function duplicateCard(
  cardId: string,
  targetListId: string,
  userId: string,
  options: DuplicateCardOptions = {},
): Promise<(Document & ICard) | null> {
  const sourceCard = await Card.findById(cardId);
  if (!sourceCard) {
    return null;
  }

  // Check permissions
  const board = await Board.findById(sourceCard.boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  if (!options.skipSourcePermissionCheck && board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, sourceCard.boardId.toString(), 'cards.duplicate');
    if (!allowed) {
      throw new Error('Insufficient permissions to duplicate card');
    }
  }

  const targetList = await List.findById(targetListId);
  if (!targetList) {
    throw new Error('Target list not found');
  }

  const targetBoardId = targetList.boardId.toString();
  const targetBoard = await Board.findById(targetBoardId);
  if (targetBoard == null) {
    throw new Error('Target board not found');
  }

  if (targetBoard.ownerId.toString() !== userId) {
    const canViewTarget = await hasPermission({ id: userId }, targetBoardId, 'boards.view');
    if (!canViewTarget) {
      throw new Error('Insufficient permissions to view target board');
    }
  }

  const { max, enforce } = getBoardListCardLimits(targetBoard);
  if (enforce) {
    const cardCount = await Card.countDocuments({ listId: targetListId });
    if (cardCount >= max) {
      throw new Error(`Target list has reached maximum card limit of ${max}`);
    }
  }

  const nextPos = await computeInsertPosAtTopOfList(targetListId);

  const sourceAttachments: readonly ICardAttachment[] = sourceCard.attachments ?? [];

  // Create duplicate (top of target list; attachments copied in MinIO after `_id` exists)
  const duplicate = new Card({
    listId: targetListId,
    boardId: targetBoardId,
    title: `${sourceCard.title} (Copy)`.slice(0, CARD_TITLE_MAX_LENGTH),
    description: sourceCard.description,
    descriptionHtml: sourceCard.descriptionHtml,
    descriptionPreview: sourceCard.descriptionPreview,
    descriptionCharCount: sourceCard.descriptionCharCount,
    position: 0,
    pos: nextPos,
    color: sourceCard.color,
    labels: sourceCard.labels,
    dueDate: sourceCard.dueDate,
    startDate: sourceCard.startDate,
    endDate: sourceCard.endDate,
    completed: false,
    createdBy: userId,
    assignees: sourceCard.assignees,
    reminders: [],
    attachments: [],
    comments: cloneCardComments(sourceCard.comments),
    checklists: cloneChecklistsForDuplicate(sourceCard.checklists),
  });

  const newCardId = duplicate._id.toString();
  duplicate.attachments = await duplicateCardAttachmentsForNewCard({
    sourceAttachments,
    newCardId,
  });
  const nextDescription = remapAttachmentRefsInDescriptionJsonString(
    sourceCard.description,
    sourceAttachments,
    duplicate.attachments,
  );
  if (nextDescription !== undefined) {
    duplicate.description = nextDescription;
  }
  const nextDescriptionHtml = remapAttachmentRefsInDescriptionHtmlString(
    sourceCard.descriptionHtml,
    sourceAttachments,
    duplicate.attachments,
  );
  if (nextDescriptionHtml !== undefined) {
    duplicate.descriptionHtml = nextDescriptionHtml;
  }
  duplicate.reminders = cloneRemindersForDuplicate(sourceCard.reminders);
  const remappedCover = remapCoverForDuplicate(sourceCard.cover, sourceAttachments, duplicate.attachments);
  const nextCover = remappedCover !== undefined ? remappedCover : sourceCard.cover;
  if (typeof nextCover === 'string') {
    duplicate.cover = nextCover;
  }

  await duplicate.save();
  await syncListPositionsFromPosOrder(targetListId);

  const rowNumericPos = (r: CardPosLeanRow): number =>
    typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : (r.position + 1) * CARD_POS_STEP;

  const maybeRenormalize = async (lid: string): Promise<void> => {
    const rows = sortCardRowsByPos(
      await Card.find({ listId: lid }).select('pos position').lean<CardPosLeanRow[]>(),
    );
    const pl = rows.map(rowNumericPos);
    if (pl.length >= 2 && posNeedsNormalize(pl)) {
      await normalizeListPosSpread(lid);
    }
  };
  await maybeRenormalize(targetListId);

  const refreshed = await Card.findById(duplicate._id);
  if (refreshed == null) {
    return null;
  }

  const sourceBoardId = sourceCard.boardId.toString();
  const serverTs = Date.now();

  const emitBoardIds = sourceBoardId === targetBoardId ? [targetBoardId] : [sourceBoardId, targetBoardId];

  for (const emitBoardId of emitBoardIds) {
    emitToBoard(emitBoardId, 'card:duplicated', {
      originalCardId: cardId,
      duplicatedCardId: refreshed._id.toString(),
      targetListId,
      boardId: targetBoardId,
      data: refreshed.toObject(),
      serverTs,
    });
  }

  const buildListPayload = async (lid: string) => {
    const rows = sortCardRowsByPos(
      await Card.find({ listId: lid }).select('pos position').lean<CardPosLeanRow[]>(),
    );
    return {
      listId: lid,
      orderedCardIds: rows.map((r) => r._id.toString()),
      orderedPos: rows.map((r) => rowNumericPos(r)),
    };
  };
  emitToBoard(targetBoardId, 'cards:positions-batch-updated', {
    boardId: targetBoardId,
    fromListId: sourceCard.listId.toString(),
    toListId: targetListId,
    movedCardId: refreshed._id.toString(),
    position: 0,
    lists: [await buildListPayload(targetListId)],
    serverTs,
  });

  logAuditEvent({
    userId,
    action: 'card.duplicate',
    resourceType: 'card',
    resourceId: cardId,
    metadata: { duplicatedCardId: refreshed._id.toString(), targetListId, targetBoardId },
    timestamp: new Date(),
  });

  createActivity({
    boardId: targetBoardId,
    cardId: refreshed._id.toString(),
    userId,
    type: 'card.created',
    description: `Card duplicated from "${sourceCard.title}"`,
  });

  return refreshed;
}
