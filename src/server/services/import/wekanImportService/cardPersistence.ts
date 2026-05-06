import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { deriveCardDescriptionPreview } from '../../cardViewService.js';
import { renderCardDescriptionHtml } from '../../../utils/cardDescriptionHtml.js';
import { resolveImportedCardColour } from '../../../../shared/utils/importDefaultCardColour.js';
import {
  CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
} from '../../../../shared/constants/entityTextLimits.js';
import { normalizeImportedColour } from './helpers.js';
import { sanitizeImportedPlainText, wekanDescriptionToCardJson } from './description.js';
import type { WekanCard, WekanCardInsertContext } from './types.js';

/** Matches Trello import card bulk-insert chunk size (`trelloImportService`). */
export const WEKAN_CARD_INSERT_BATCH = 80;

export function groupWekanRowsByCardId<T extends { cardId: string }>(rows: readonly T[] | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  if (rows == null) {
    return m;
  }
  for (const row of rows) {
    const key = row.cardId;
    const prev = m.get(key);
    if (prev != null) {
      prev.push(row);
    } else {
      m.set(key, [row]);
    }
  }
  return m;
}

export function buildWekanCardInsertPlainObject(
  wekanCard: WekanCard,
  ctx: WekanCardInsertContext,
): Record<string, unknown> | undefined {
  const listIdStr = ctx.listMap.get(wekanCard.listId);
  const boardIdStr = ctx.boardMap.get(wekanCard.boardId);
  if (listIdStr == null || boardIdStr == null) {
    return undefined;
  }

  const cardLabels = (wekanCard.labelIds || [])
    .map((labelId) => ctx.labelMap.get(labelId))
    .filter((meta): meta is { id: string; name: string; color: string } => meta !== undefined)
    .map((meta) => ({ id: meta.id, name: meta.name, color: meta.color }));

  const assigneeIds = (wekanCard.members || [])
    .map((memberId) => {
      const mappedId = ctx.userMap.get(memberId);
      return mappedId ? new mongoose.Types.ObjectId(mappedId) : null;
    })
    .filter((id): id is mongoose.Types.ObjectId => id !== null);

  const cardChecklists = (ctx.checklistsByCardId.get(wekanCard._id) ?? []).map((checklist) => ({
    id: crypto.randomUUID(),
    title: checklist.title,
    items: (checklist.items || []).map((item) => ({
      id: crypto.randomUUID(),
      text: item.title,
      completed: item.isFinished || false,
      completedAt: item.finishedAt ? new Date(item.finishedAt) : undefined,
      sortOrder: item.sortOrder,
    })),
  }));

  const cardComments = (ctx.commentsByCardId.get(wekanCard._id) ?? []).map((comment) => {
    const commentUserId = ctx.userMap.get(comment.userId);
    return {
      id: crypto.randomUUID(),
      userId: new mongoose.Types.ObjectId(commentUserId || ctx.userId),
      text: comment.text,
      createdAt: new Date(comment.createdAt),
      updatedAt: new Date(comment.modifiedAt || comment.createdAt),
    };
  });

  const cardAttachments = (ctx.attachmentsByCardId.get(wekanCard._id) ?? []).map((attachment) => {
    const rawName = (attachment.name || 'attachment').trim();
    const storedName = rawName.length > 0 ? rawName.slice(0, CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH) : 'attachment';
    return {
      id: crypto.randomUUID(),
      name: storedName,
      originalFileName: storedName,
      url: '',
      isPlaceholder: true,
      type: attachment.type || 'unknown',
      size: attachment.size || 0,
      uploadedAt: new Date(attachment.uploadedAt),
      uploadedBy: new mongoose.Types.ObjectId(ctx.userMap.get(attachment.userId) || ctx.userId),
    };
  });

  const sanitizedCardTitle = sanitizeImportedPlainText(wekanCard.title) || 'Untitled card';
  let description: string | undefined;
  let descriptionHtml = '';
  let descriptionPreview = '';
  let descriptionCharCount = 0;
  if (typeof wekanCard.description === 'string' && wekanCard.description.trim() !== '') {
    const descStr = wekanDescriptionToCardJson(
      wekanCard.description,
      ctx.replacementByIconSrc,
      ctx.localizedByIconSrc,
    );
    description = descStr !== '' ? descStr : undefined;
    if (description != null && description !== '') {
      const pv = deriveCardDescriptionPreview(description);
      descriptionPreview = pv.preview;
      descriptionCharCount = pv.charCount;
      descriptionHtml = renderCardDescriptionHtml(description);
    }
  }

  return {
    listId: new mongoose.Types.ObjectId(listIdStr),
    boardId: new mongoose.Types.ObjectId(boardIdStr),
    title: sanitizedCardTitle.slice(0, CARD_TITLE_MAX_LENGTH),
    ...(description !== undefined ? { description } : {}),
    descriptionHtml,
    descriptionPreview,
    descriptionCharCount,
    position: wekanCard.sort || 0,
    color: resolveImportedCardColour(
      normalizeImportedColour(wekanCard.color) ?? (/^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? wekanCard.cover : undefined),
      ctx.defaultUncolouredCardColour,
    ),
    cover: /^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? undefined : wekanCard.cover,
    labels: cardLabels,
    dueDate: wekanCard.dueAt ? new Date(wekanCard.dueAt) : undefined,
    startDate: wekanCard.startAt ? new Date(wekanCard.startAt) : undefined,
    completed: !!wekanCard.finishedAt,
    completedAt: wekanCard.finishedAt ? new Date(wekanCard.finishedAt) : undefined,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
    assignees: assigneeIds,
    reminders: [],
    attachments: cardAttachments,
    comments: cardComments,
    checklists: cardChecklists,
  };
}
