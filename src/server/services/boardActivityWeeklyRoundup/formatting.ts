import {
  BOARD_ACTIVITY_ROUNDUP_LOG_SCROLL_MAX_HEIGHT_PX,
} from '../../../shared/constants/boardActivityEmailRoundup.js';

export interface RoundupActivityRow {
  readonly createdAt: Date;
  readonly description: string;
  readonly actorName: string;
}

export interface RoundupActivitiesRenderResult {
  readonly activitiesHtml: string;
  readonly activityCount: number;
}

const ROUNDUP_TIMESTAMP_COL_PX = 188;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatRoundupPeriodLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const startLabel = start.toLocaleDateString('en-US', opts);
  const endLabel = end.toLocaleDateString('en-US', opts);
  return `${startLabel} – ${endLabel}`;
}

export function formatRoundupActivityTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildRoundupActivitiesHtml(
  activities: readonly RoundupActivityRow[],
  options?: {
    readonly scrollMaxHeightPx?: number;
    readonly separatorColor?: string;
    readonly textColor?: string;
  },
): RoundupActivitiesRenderResult {
  const activityCount = activities.length;
  const scrollMaxHeightPx =
    options?.scrollMaxHeightPx ?? BOARD_ACTIVITY_ROUNDUP_LOG_SCROLL_MAX_HEIGHT_PX;
  const separatorColor = options?.separatorColor ?? '#e8e4dc';
  const textColor = options?.textColor ?? 'inherit';

  if (activityCount === 0) {
    return {
      activitiesHtml: '',
      activityCount: 0,
    };
  }

  const rowBorder = `border-bottom:1px solid ${separatorColor}`;
  const rows = activities
    .map((row) => {
      const when = escapeHtml(formatRoundupActivityTimestamp(row.createdAt));
      const actor = escapeHtml(row.actorName);
      const description = escapeHtml(row.description);
      return `<tr>
  <td style="width:${ROUNDUP_TIMESTAMP_COL_PX}px;max-width:${ROUNDUP_TIMESTAMP_COL_PX}px;vertical-align:top;padding:10px 14px 10px 0;${rowBorder};font-size:12px;line-height:1.45;color:${textColor};opacity:0.7;white-space:nowrap;">${when}</td>
  <td style="width:100%;vertical-align:top;padding:10px 0;${rowBorder};font-size:13px;line-height:1.55;color:${textColor};word-break:break-word;"><strong>${actor}</strong> — ${description}</td>
</tr>`;
    })
    .join('\n');

  const activitiesHtml = `<div style="width:100%;max-width:100%;box-sizing:border-box;max-height:${scrollMaxHeightPx}px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;border:1px solid ${separatorColor};border-radius:8px;padding:2px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:100%;table-layout:fixed;margin:0;">
<colgroup>
  <col style="width:${ROUNDUP_TIMESTAMP_COL_PX}px;" />
  <col />
</colgroup>
${rows}
</table>
</div>`;

  return { activitiesHtml, activityCount };
}
