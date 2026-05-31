import mongoose from 'mongoose';
import type { ICardAttachment, ICardComment, ICardReminder, IChecklist } from '../../models/Card.js';
import {
  cardCoverReferencesAttachment,
  extractAttachmentIdFromMediaSrc,
  remapAttachmentRefsInDescriptionHtmlString,
  remapAttachmentRefsInDescriptionJsonString,
} from '../../../shared/cardDescriptionAttachmentRefs.js';
import { CARD_TITLE_MAX_LENGTH } from '../../../shared/constants/entityTextLimits.js';
import type { SourceCardForDuplicate } from './cardDuplicationTypes.js';

export function cloneCardComments(comments: readonly ICardComment[] | undefined): ICardComment[] {
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

export function cloneChecklistsForDuplicate(checklists: readonly IChecklist[] | undefined): IChecklist[] {
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

export function cloneRemindersForDuplicate(reminders: readonly ICardReminder[] | undefined): ICardReminder[] {
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

export function duplicateCardTitle(sourceTitle: string): string {
  return sourceTitle.trim().slice(0, CARD_TITLE_MAX_LENGTH);
}

/** When cover referenced a copied attachment, point it at the new row (URL or `/attachments/:id/file`). */
export function remapCoverForDuplicate(
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

export function finalizeDuplicatedCardFieldsFromAttachments(
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

export function buildCardInsertDoc(
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
