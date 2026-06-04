import mongoose from 'mongoose';
import type {
  ICard,
  ICardAttachment,
  ICardComment,
  ICardReminder,
  IChecklist,
} from '../../models/Card.js';

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
