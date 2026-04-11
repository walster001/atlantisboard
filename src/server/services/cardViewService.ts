import type { ICard } from '../models/Card.js';
import type { ChecklistProgressDTO, CardDetailDTO, CardSummaryDTO } from '../../shared/types/viewModels.js';

export type CardViewMode = 'summary' | 'detail';

function extractPlainTextFromRichJsonNode(node: unknown): string {
  if (node == null || typeof node !== 'object') {
    return '';
  }
  const obj = node as { type?: unknown; text?: unknown; content?: unknown; attrs?: unknown };
  if (obj.type === 'inlineButton') {
    return '';
  }
  if (obj.type === 'twemojiEmoji' && obj.attrs != null && typeof obj.attrs === 'object') {
    const emoji = (obj.attrs as { emoji?: unknown }).emoji;
    if (typeof emoji === 'string' && emoji.trim() !== '') {
      return emoji;
    }
  }
  const selfText = typeof obj.text === 'string' ? obj.text : '';
  const children = Array.isArray(obj.content)
    ? obj.content.map((child) => extractPlainTextFromRichJsonNode(child)).join(' ')
    : '';
  return `${selfText} ${children}`.trim();
}

function extractPlainDescription(description: string | undefined): string {
  if (description == null || description.trim() === '') {
    return '';
  }
  try {
    const parsed = JSON.parse(description) as unknown;
    return extractPlainTextFromRichJsonNode(parsed)
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return description.replace(/\s+/g, ' ').trim();
  }
}

export function deriveCardDescriptionPreview(
  description: string | undefined
): { preview: string; charCount: number } {
  const plain = extractPlainDescription(description);
  const charCount = plain.length;
  const preview = charCount > 320 ? `${plain.slice(0, 320)}...` : plain;
  return { preview, charCount };
}

export function computeChecklistProgress(checklists: ICard['checklists']): ChecklistProgressDTO {
  let total = 0;
  let completed = 0;
  for (const checklist of checklists) {
    for (const item of checklist.items) {
      total += 1;
      if (item.completed) {
        completed += 1;
      }
    }
  }
  return { completed, total };
}

export function toCardSummary(card: ICard): CardSummaryDTO {
  return {
    id: card._id.toString(),
    listId: card.listId.toString(),
    boardId: card.boardId.toString(),
    title: card.title,
    position: card.position,
    ...(card.color !== undefined ? { color: card.color } : {}),
    ...(card.cover !== undefined ? { cover: card.cover } : {}),
    labels: card.labels,
    ...(card.dueDate !== undefined ? { dueDate: card.dueDate } : {}),
    ...(card.startDate !== undefined ? { startDate: card.startDate } : {}),
    completed: card.completed,
    ...(card.completedAt !== undefined ? { completedAt: card.completedAt } : {}),
    createdBy: card.createdBy.toString(),
    assignees: card.assignees.map((id) => id.toString()),
    descriptionPreview: card.descriptionPreview,
    descriptionCharCount: card.descriptionCharCount,
    attachmentCount: card.attachments.length,
    commentCount: card.comments.length,
    checklistProgress: computeChecklistProgress(card.checklists),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export function toCardDetail(card: ICard): CardDetailDTO {
  return {
    id: card._id.toString(),
    listId: card.listId.toString(),
    boardId: card.boardId.toString(),
    title: card.title,
    ...(card.description !== undefined ? { description: card.description } : {}),
    ...(card.descriptionHtml !== undefined && card.descriptionHtml !== ''
      ? { descriptionHtml: card.descriptionHtml }
      : {}),
    descriptionPreview: card.descriptionPreview,
    descriptionCharCount: card.descriptionCharCount,
    position: card.position,
    ...(card.color !== undefined ? { color: card.color } : {}),
    ...(card.cover !== undefined ? { cover: card.cover } : {}),
    labels: card.labels,
    ...(card.dueDate !== undefined ? { dueDate: card.dueDate } : {}),
    ...(card.startDate !== undefined ? { startDate: card.startDate } : {}),
    completed: card.completed,
    ...(card.completedAt !== undefined ? { completedAt: card.completedAt } : {}),
    createdBy: card.createdBy.toString(),
    assignees: card.assignees.map((id) => id.toString()),
    reminders: card.reminders.map((reminder) => ({
      id: reminder.id,
      triggerAt: reminder.triggerAt,
      ...(reminder.repeatFrequency !== undefined ? { repeatFrequency: reminder.repeatFrequency } : {}),
      sent: reminder.sent,
      dismissed: reminder.dismissed,
    })),
    attachments: card.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      type: attachment.type,
      size: attachment.size,
      uploadedAt: attachment.uploadedAt,
      uploadedBy: attachment.uploadedBy.toString(),
    })),
    comments: card.comments.map((comment) => ({
      id: comment.id,
      userId: comment.userId.toString(),
      text: comment.text,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    })),
    checklists: card.checklists.map((checklist) => ({
      id: checklist.id,
      title: checklist.title,
      items: checklist.items.map((item) => ({
        id: item.id,
        text: item.text,
        completed: item.completed,
        ...(item.completedAt !== undefined ? { completedAt: item.completedAt } : {}),
        ...(item.sortOrder !== undefined ? { sortOrder: item.sortOrder } : {}),
      })),
    })),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}
