import mongoose, { type Document } from 'mongoose';
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
import { duplicateCardAttachmentsForManyCards } from '../attachmentService.js';
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

/** Lean or hydrated card row used when duplicating one or many cards. */
export type SourceCardForDuplicate = {
  readonly _id: mongoose.Types.ObjectId | string;
  readonly boardId: mongoose.Types.ObjectId | string;
  readonly listId: mongoose.Types.ObjectId | string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly descriptionHtml?: string | undefined;
  readonly descriptionPreview?: string | undefined;
  readonly descriptionCharCount?: number | undefined;
  readonly color?: string | undefined;
  readonly cover?: string | undefined;
  readonly labels?: ICard['labels'];
  readonly dueDate?: Date | undefined;
  readonly startDate?: Date | undefined;
  readonly endDate?: Date | undefined;
  readonly assignees?: readonly mongoose.Types.ObjectId[];
  readonly attachments?: readonly ICardAttachment[];
  readonly comments?: readonly ICardComment[];
  readonly checklists?: readonly IChecklist[];
  readonly reminders?: readonly ICardReminder[];
};

export interface DuplicateCardOptions {
  /** Used when duplicating cards as part of `lists.duplicate` (permission already checked). */
  readonly skipSourcePermissionCheck?: boolean;
  /** Skip per-card activity rows (list duplicate uses one list-level audit). */
  readonly skipActivities?: boolean;
  /** Skip per-card audit rows (list duplicate logs `list.duplicate` only). */
  readonly skipAudit?: boolean;
}

export interface DuplicateCardsBatchOptions extends DuplicateCardOptions {
  readonly sourceBoardIdForSocket?: string;
}

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

function duplicateCardTitle(sourceTitle: string): string {
  return sourceTitle.trim().slice(0, CARD_TITLE_MAX_LENGTH);
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

const rowNumericPos = (r: CardPosLeanRow): number =>
  typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : (r.position + 1) * CARD_POS_STEP;

async function computeInsertPosValuesAtTopOfList(listId: string, count: number): Promise<number[]> {
  if (count <= 0) {
    return [];
  }

  await ensureCardsHavePosForList(listId);

  const loadNeighborPos = async (): Promise<number[]> => {
    const rows = sortCardRowsByPos(
      await Card.find({ listId }).select('pos position').lean<CardPosLeanRow[]>(),
    );
    return rows.map(rowNumericPos);
  };

  let neighborPos = await loadNeighborPos();
  if (neighborPos.length >= 2 && posNeedsNormalize(neighborPos)) {
    await normalizeListPosSpread(listId);
    neighborPos = await loadNeighborPos();
  }

  const values: number[] = new Array(count);
  let after: number | null = neighborPos.length > 0 ? neighborPos[0]! : null;

  for (let i = count - 1; i >= 0; i -= 1) {
    if (i === count - 1 && posGapTooSmall(null, after)) {
      await normalizeListPosSpread(listId);
      neighborPos = await loadNeighborPos();
      after = neighborPos.length > 0 ? neighborPos[0]! : null;
    }
    const newPos = insertPosBetween(null, after);
    values[i] = newPos;
    after = newPos;
  }

  return values;
}

function finalizeDuplicatedCardFieldsFromAttachments(
  source: SourceCardForDuplicate,
  attachments: readonly ICardAttachment[],
): {
  attachments: ICardAttachment[];
  description: string | undefined;
  descriptionHtml: string | undefined;
  reminders: ICardReminder[];
  cover: string | undefined;
} {
  const sourceAttachments: readonly ICardAttachment[] = source.attachments ?? [];
  const nextDescription = remapAttachmentRefsInDescriptionJsonString(
    source.description,
    sourceAttachments,
    attachments,
  );
  const nextDescriptionHtml = remapAttachmentRefsInDescriptionHtmlString(
    source.descriptionHtml,
    sourceAttachments,
    attachments,
  );
  const reminders = cloneRemindersForDuplicate(source.reminders);
  const remappedCover = remapCoverForDuplicate(source.cover, sourceAttachments, attachments);
  const cover = remappedCover !== undefined ? remappedCover : source.cover;

  return {
    attachments: [...attachments],
    description: nextDescription !== undefined ? nextDescription : source.description,
    descriptionHtml: nextDescriptionHtml !== undefined ? nextDescriptionHtml : source.descriptionHtml,
    reminders,
    cover: typeof cover === 'string' ? cover : undefined,
  };
}

function buildCardInsertDoc(
  source: SourceCardForDuplicate,
  targetListId: string,
  targetBoardId: string,
  userId: string,
  pos: number,
  newCardId: mongoose.Types.ObjectId,
  finalized: ReturnType<typeof finalizeDuplicatedCardFieldsFromAttachments>,
): Record<string, unknown> {
  return {
    _id: newCardId,
    listId: new mongoose.Types.ObjectId(targetListId),
    boardId: new mongoose.Types.ObjectId(targetBoardId),
    title: duplicateCardTitle(source.title),
    description: finalized.description,
    descriptionHtml: finalized.descriptionHtml,
    descriptionPreview: source.descriptionPreview ?? '',
    descriptionCharCount: source.descriptionCharCount ?? 0,
    position: 0,
    pos,
    color: source.color,
    cover: finalized.cover,
    labels: source.labels ?? [],
    dueDate: source.dueDate,
    startDate: source.startDate,
    endDate: source.endDate,
    completed: false,
    createdBy: new mongoose.Types.ObjectId(userId),
    assignees: source.assignees ?? [],
    reminders: finalized.reminders,
    attachments: finalized.attachments,
    comments: cloneCardComments(source.comments),
    checklists: cloneChecklistsForDuplicate(source.checklists),
  };
}

async function maybeRenormalizeListPos(listId: string): Promise<void> {
  const rows = sortCardRowsByPos(
    await Card.find({ listId }).select('pos position').lean<CardPosLeanRow[]>(),
  );
  const pl = rows.map(rowNumericPos);
  if (pl.length >= 2 && posNeedsNormalize(pl)) {
    await normalizeListPosSpread(listId);
  }
}

function emitDuplicationRealtime(args: {
  readonly created: readonly (Document & ICard)[];
  readonly sourceCards: readonly SourceCardForDuplicate[];
  readonly targetListId: string;
  readonly targetBoardId: string;
  readonly sourceBoardIdForSocket: string;
  readonly orderedCardIds: readonly string[];
  readonly orderedPos: readonly number[];
}): void {
  const { created, sourceCards, targetListId, targetBoardId, sourceBoardIdForSocket } = args;
  const serverTs = Date.now();
  const emitBoardIds =
    sourceBoardIdForSocket === targetBoardId
      ? [targetBoardId]
      : [sourceBoardIdForSocket, targetBoardId];

  for (let i = 0; i < created.length; i += 1) {
    const refreshed = created[i];
    const source = sourceCards[i];
    if (refreshed == null || source == null) {
      continue;
    }
    const originalCardId =
      typeof source._id === 'string' ? source._id : source._id.toString();
    for (const emitBoardId of emitBoardIds) {
      emitToBoard(emitBoardId, 'card:duplicated', {
        originalCardId,
        duplicatedCardId: refreshed._id.toString(),
        targetListId,
        boardId: targetBoardId,
        data: refreshed.toObject(),
        serverTs,
      });
    }
  }

  emitToBoard(targetBoardId, 'cards:positions-batch-updated', {
    boardId: targetBoardId,
    fromListId: sourceCards[0]?.listId != null ? String(sourceCards[0].listId) : targetListId,
    toListId: targetListId,
    movedCardId: created[created.length - 1]?._id.toString() ?? '',
    position: 0,
    lists: [
      {
        listId: targetListId,
        orderedCardIds: args.orderedCardIds,
        orderedPos: args.orderedPos,
      },
    ],
    serverTs,
  });
}

/**
 * Duplicates multiple cards into one list in a single batched write (shared positioning sync and socket batch).
 */
export async function duplicateCardsBatch(
  sourceCards: readonly SourceCardForDuplicate[],
  targetListId: string,
  userId: string,
  options: DuplicateCardsBatchOptions = {},
): Promise<(Document & ICard)[]> {
  if (sourceCards.length === 0) {
    return [];
  }

  const targetList = await List.findById(targetListId);
  if (targetList == null) {
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
    if (cardCount + sourceCards.length > max) {
      throw new Error(`Target list cannot exceed maximum card limit of ${max}`);
    }
  }

  const posValues = await computeInsertPosValuesAtTopOfList(targetListId, sourceCards.length);

  const plans = sourceCards.map((source, index) => ({
    source,
    newCardId: new mongoose.Types.ObjectId(),
    pos: posValues[index] ?? CARD_POS_STEP,
  }));

  const attachmentRowsByPlan = await duplicateCardAttachmentsForManyCards(
    plans.map((plan) => ({
      sourceAttachments: plan.source.attachments ?? [],
      newCardId: plan.newCardId.toString(),
    })),
  );

  const prepared = plans.map((plan, index) => {
    const finalized = finalizeDuplicatedCardFieldsFromAttachments(
      plan.source,
      attachmentRowsByPlan[index] ?? [],
    );
    const doc = buildCardInsertDoc(
      plan.source,
      targetListId,
      targetBoardId,
      userId,
      plan.pos,
      plan.newCardId,
      finalized,
    );
    return { source: plan.source, doc, newCardId: plan.newCardId };
  });

  const inserted = (await Card.insertMany(
    prepared.map((p) => p.doc),
    { ordered: true },
  )) as (Document & ICard)[];

  await syncListPositionsFromPosOrder(targetListId);
  await maybeRenormalizeListPos(targetListId);

  const created = inserted;
  const listOrderRows = sortCardRowsByPos(
    await Card.find({ listId: targetListId }).select('pos position').lean<CardPosLeanRow[]>(),
  );
  const orderedCardIds = listOrderRows.map((r) => r._id.toString());
  const orderedPos = listOrderRows.map((r) => rowNumericPos(r));

  const sourceBoardIdForSocket =
    options.sourceBoardIdForSocket ??
    (typeof sourceCards[0]!.boardId === 'string'
      ? sourceCards[0]!.boardId
      : sourceCards[0]!.boardId.toString());

  emitDuplicationRealtime({
    created,
    sourceCards,
    targetListId,
    targetBoardId,
    sourceBoardIdForSocket,
    orderedCardIds,
    orderedPos,
  });

  if (options.skipAudit !== true) {
    for (let i = 0; i < created.length; i += 1) {
      const card = created[i];
      const source = sourceCards[i];
      if (card == null || source == null) {
        continue;
      }
      const originalCardId =
        typeof source._id === 'string' ? source._id : source._id.toString();
      logAuditEvent({
        userId,
        action: 'card.duplicate',
        resourceType: 'card',
        resourceId: originalCardId,
        metadata: { duplicatedCardId: card._id.toString(), targetListId, targetBoardId },
        timestamp: new Date(),
      });
    }
  }

  if (options.skipActivities !== true) {
    for (const card of created) {
      createActivity({
        boardId: targetBoardId,
        cardId: card._id.toString(),
        userId,
        type: 'card.created',
        description: `Card duplicated: "${card.title}"`,
      });
    }
  }

  return created;
}

export async function duplicateCard(
  cardId: string,
  targetListId: string,
  userId: string,
  options: DuplicateCardOptions = {},
): Promise<(Document & ICard) | null> {
  const sourceCard = await Card.findById(cardId);
  if (sourceCard == null) {
    return null;
  }

  const board = await Board.findById(sourceCard.boardId);
  if (board == null) {
    throw new Error('Board not found');
  }

  if (!options.skipSourcePermissionCheck && board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, sourceCard.boardId.toString(), 'cards.duplicate');
    if (!allowed) {
      throw new Error('Insufficient permissions to duplicate card');
    }
  }

  const created = await duplicateCardsBatch([sourceCard], targetListId, userId, {
    ...options,
    sourceBoardIdForSocket: sourceCard.boardId.toString(),
  });

  return created[0] ?? null;
}
