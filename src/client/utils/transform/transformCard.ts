import type { CardDB } from '../../store/database.js';
import type { AttachmentScanStatus } from '../../../shared/attachmentScanStatus.js';
import { extractMongoStringId } from '../../../shared/mongoId.js';

export function transformCard(card: unknown): CardDB {
  const c = card as {
    _id?: string | { toString: () => string };
    id?: string;
    listId?: string | { toString: () => string };
    boardId?: string | { toString: () => string };
    title: string;
    description?: string;
    descriptionHtml?: string;
    descriptionPreview?: string;
    descriptionCharCount?: number;
    position: number;
    pos?: number;
    color?: string;
    cover?: string;
    labels?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      name: string;
      color: string;
    }>;
    dueDate?: Date | string;
    startDate?: Date | string;
    endDate?: Date | string;
    completed: boolean;
    completedAt?: Date | string;
    createdBy?: string | { toString: () => string };
    assignees?: Array<string | { toString: () => string } | { _id?: string | { toString: () => string } }>;
    reminders?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      triggerAt: Date | string;
      repeatFrequency?: string;
      sent: boolean;
      dismissed: boolean;
    }>;
    attachments?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      name: string;
      url: string;
      originalFileName?: string;
      isPlaceholder?: boolean;
      scanStatus?: AttachmentScanStatus;
      type: string;
      size: number;
      uploadedAt: Date | string;
      uploadedBy: string | { toString: () => string };
    }>;
    comments?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      userId: string | { toString: () => string };
      text: string;
      createdAt: Date | string;
      updatedAt: Date | string;
    }>;
    commentCount?: number;
    attachmentCount?: number;
    checklistProgress?: {
      completed: number;
      total: number;
    };
    checklists?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      title: string;
      items: Array<{
        _id?: string | { toString: () => string };
        id?: string;
        text: string;
        completed: boolean;
        completedAt?: Date | string;
        sortOrder?: number;
      }>;
    }>;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  const id = extractMongoStringId(c.id) || extractMongoStringId(c._id);
  const listId = extractMongoStringId(c.listId);
  const boardId = extractMongoStringId(c.boardId);
  const createdBy = extractMongoStringId(c.createdBy);

  // Transform labels
  const labels = (c.labels || []).map((label) => {
    const labelId = extractMongoStringId(label.id) || extractMongoStringId(label._id);
    return {
      id: labelId,
      name: label.name,
      color: label.color,
    };
  });

  // Transform assignees
  const assignees = (c.assignees || []).map((assignee) => {
    if (typeof assignee === 'string') {
      return assignee;
    }
    if (typeof assignee === 'object' && assignee !== null) {
      if ('_id' in assignee) {
        return extractMongoStringId(assignee._id);
      }
      const fromObj = extractMongoStringId(assignee);
      return fromObj || String(assignee);
    }
    return extractMongoStringId(assignee) || String(assignee);
  });

  // Transform reminders
  const reminders = (c.reminders || []).map((reminder) => {
    const reminderId = extractMongoStringId(reminder.id) || extractMongoStringId(reminder._id);
    return {
      id: reminderId,
      triggerAt: typeof reminder.triggerAt === 'string' ? new Date(reminder.triggerAt) : reminder.triggerAt,
      ...(reminder.repeatFrequency !== undefined && { repeatFrequency: reminder.repeatFrequency }),
      sent: reminder.sent || false,
      dismissed: reminder.dismissed || false,
    };
  });

  // Transform attachments (socket patches may send a non-array top-level `attachments` value)
  const attachmentsSource = Array.isArray(c.attachments) ? c.attachments : [];
  const attachments = attachmentsSource.map((attachment) => {
    const attachmentId = extractMongoStringId(attachment.id) || extractMongoStringId(attachment._id);
    const uploadedBy = extractMongoStringId(attachment.uploadedBy);
    return {
      id: attachmentId,
      name: attachment.name,
      url: attachment.url,
      ...(typeof attachment.originalFileName === 'string' && attachment.originalFileName.trim() !== ''
        ? { originalFileName: attachment.originalFileName.trim() }
        : {}),
      ...(attachment.isPlaceholder === true ? { isPlaceholder: true } : {}),
      ...(typeof attachment.scanStatus === 'string' ? { scanStatus: attachment.scanStatus } : {}),
      type: attachment.type,
      size: attachment.size,
      uploadedAt: typeof attachment.uploadedAt === 'string' ? new Date(attachment.uploadedAt) : attachment.uploadedAt,
      uploadedBy,
    };
  });

  // Transform comments
  const comments = (c.comments || []).map((comment) => {
    const commentId = extractMongoStringId(comment.id) || extractMongoStringId(comment._id);
    const userId = extractMongoStringId(comment.userId);
    return {
      id: commentId,
      userId,
      text: comment.text,
      createdAt: typeof comment.createdAt === 'string' ? new Date(comment.createdAt) : comment.createdAt,
      updatedAt: typeof comment.updatedAt === 'string' ? new Date(comment.updatedAt) : comment.updatedAt,
    };
  });

  // Transform checklists
  const checklists = (c.checklists || []).map((checklist) => {
    const checklistId = extractMongoStringId(checklist.id) || extractMongoStringId(checklist._id);
    return {
      id: checklistId,
      title: checklist.title,
      items: checklist.items.map((item) => {
        const itemId = extractMongoStringId(item.id) || extractMongoStringId(item._id);
        return {
          id: itemId,
          text: item.text,
          completed: item.completed || false,
          ...(item.completedAt !== undefined && {
            completedAt: typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt,
          }),
          ...(item.sortOrder !== undefined && { sortOrder: item.sortOrder }),
        };
      }),
    };
  });

  return {
    id,
    listId,
    boardId,
    title: c.title,
    ...(c.description !== undefined && { description: c.description }),
    ...(c.descriptionHtml !== undefined && { descriptionHtml: c.descriptionHtml }),
    ...(c.descriptionPreview !== undefined && { descriptionPreview: c.descriptionPreview }),
    ...(typeof c.descriptionCharCount === 'number' && !Number.isNaN(c.descriptionCharCount)
      ? { descriptionCharCount: c.descriptionCharCount }
      : {}),
    position: c.position || 0,
    ...(typeof c.pos === 'number' && Number.isFinite(c.pos) ? { pos: c.pos } : {}),
    ...(c.color !== undefined && { color: c.color }),
    ...(c.cover !== undefined && { cover: c.cover }),
    labels,
    ...(c.dueDate !== undefined && {
      dueDate: typeof c.dueDate === 'string' ? new Date(c.dueDate) : c.dueDate,
    }),
    ...(c.startDate !== undefined && {
      startDate: typeof c.startDate === 'string' ? new Date(c.startDate) : c.startDate,
    }),
    ...(c.endDate !== undefined && {
      endDate: typeof c.endDate === 'string' ? new Date(c.endDate) : c.endDate,
    }),
    completed: c.completed || false,
    ...(c.completedAt !== undefined && {
      completedAt: typeof c.completedAt === 'string' ? new Date(c.completedAt) : c.completedAt,
    }),
    createdBy,
    assignees,
    reminders,
    attachments,
    ...(typeof c.attachmentCount === 'number' && !Number.isNaN(c.attachmentCount)
      ? { attachmentCount: c.attachmentCount }
      : {}),
    comments,
    ...(typeof c.commentCount === 'number' && !Number.isNaN(c.commentCount)
      ? { commentCount: c.commentCount }
      : {}),
    checklists,
    ...(c.checklistProgress !== undefined ? { checklistProgress: c.checklistProgress } : {}),
    createdAt: c.createdAt ? (typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt) : new Date(),
    updatedAt: c.updatedAt ? (typeof c.updatedAt === 'string' ? new Date(c.updatedAt) : c.updatedAt) : new Date(),
  };
}
