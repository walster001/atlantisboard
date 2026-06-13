import type { AdminCardListReportRow } from '../../../../shared/types/adminReporting.js';

export const ADMIN_CARD_LIST_ROW_PX = 52;
export const ADMIN_CARD_LIST_VIRTUOSO_VIEWPORT_PAD = { top: 48, bottom: 120 } as const;
export const ADMIN_CARD_LIST_VIRTUOSO_OVERSCAN = 10;

export const ADMIN_CARD_LIST_BOARD_COL_PX = 160;
export const ADMIN_CARD_LIST_LIST_COL_PX = 160;
export const ADMIN_CARD_LIST_TITLE_COL_PX = 220;
export const ADMIN_CARD_LIST_DATES_COL_PX = 200;
export const ADMIN_CARD_LIST_ASSIGNEES_COL_PX = 96;
export const ADMIN_CARD_LIST_LABELS_COL_PX = 72;
export const ADMIN_CARD_LIST_TIMESTAMP_COL_PX = 168;

export type AdminReportingCardListRow = AdminCardListReportRow;

export function formatReportingDateTime(value: string | undefined): string {
  if (value == null || value.trim() === '') {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString();
}

export function formatCardDueDates(row: AdminReportingCardListRow): string {
  const parts: string[] = [];
  if (row.startDate != null && row.startDate.trim() !== '') {
    parts.push(`Start: ${formatReportingDateOnly(row.startDate)}`);
  }
  if (row.dueDate != null && row.dueDate.trim() !== '') {
    parts.push(`Due: ${formatReportingDateOnly(row.dueDate)}`);
  }
  if (row.endDate != null && row.endDate.trim() !== '') {
    parts.push(`End: ${formatReportingDateOnly(row.endDate)}`);
  }
  if (row.completed) {
    parts.push('Completed');
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function formatReportingDateOnly(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleDateString();
}

export function formatAssigneeSummary(row: AdminReportingCardListRow): string {
  if (row.assigneeCount <= 0) {
    return '—';
  }
  return String(row.assigneeCount);
}

export function formatLabelCount(row: AdminReportingCardListRow): string {
  return String(row.labelCount);
}
