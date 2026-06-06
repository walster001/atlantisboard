import { type Document } from 'mongoose';
import type { IBoard } from '../../models/Board.js';

export interface CreateCardInput {
  listId: string;
  boardId: string;
  title: string;
  description?: string | undefined;
  position?: number | undefined;
}

export interface UpdateCardInput {
  title?: string | undefined;
  description?: string | undefined;
  listId?: string | undefined;
  position?: number | undefined;
  color?: string | undefined;
  cover?: string | undefined;
  dueDate?: Date | null | undefined;
  startDate?: Date | null | undefined;
  endDate?: Date | null | undefined;
  completed?: boolean | undefined;
}

export interface AddReminderInput {
  triggerAt: Date;
  repeatFrequency?: string;
}

export interface UpdateReminderInput {
  triggerAt?: Date;
  repeatFrequency?: string;
}

export interface CardDescriptionFieldRow {
  readonly id: string;
  readonly description: string;
  readonly descriptionHtml?: string | undefined;
}

export function getBoardListCardLimits(board: Document & IBoard): { max: number; enforce: boolean } {
  const s = board.settings;
  const max =
    typeof s.listMaxCards === 'number' && !Number.isNaN(s.listMaxCards) && s.listMaxCards >= 1
      ? s.listMaxCards
      : 1000;
  const enforce = s.listEnforceMaxCards !== false;
  return { max, enforce };
}

function dateValueMs(value: Date | undefined | null): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const t = value.getTime();
  return Number.isFinite(t) ? t : null;
}

export function cardDateFieldChanged(
  before: Date | undefined | null,
  after: Date | null | undefined,
): boolean {
  if (after === undefined) {
    return false;
  }
  return dateValueMs(before ?? undefined) !== dateValueMs(after);
}
