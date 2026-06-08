/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  BOARD_ACTIVITY_ROUNDUP_LOG_SCROLL_MAX_HEIGHT_PX,
  BOARD_ACTIVITY_ROUNDUP_PERIOD_DAYS,
} from '../src/shared/constants/boardActivityEmailRoundup.js';
import {
  buildRoundupActivitiesHtml,
  escapeHtml,
  formatRoundupPeriodLabel,
} from '../src/server/services/boardActivityWeeklyRoundup/formatting.js';
import {
  boardMemberUserIdSet,
  filterRoundupRecipientsToBoardMembers,
  type BoardMemberScope,
} from '../src/server/services/boardActivityWeeklyRoundup/recipients.js';
import { getWeeklyRoundupWindow } from '../src/server/services/boardActivityWeeklyRoundupService.js';

describe('boardActivityWeeklyRoundup formatting', () => {
  it('escapes HTML in activity rows', () => {
    const { activitiesHtml } = buildRoundupActivitiesHtml([
      {
        createdAt: new Date('2026-01-07T16:30:00Z'),
        actorName: 'Alex <script>',
        description: 'moved card "Q1 & launch"',
      },
    ]);

    expect(activitiesHtml).toContain('Alex &lt;script&gt;');
    expect(activitiesHtml).toContain('moved card &quot;Q1 &amp; launch&quot;');
    expect(activitiesHtml).not.toContain('<script>');
  });

  it('includes every activity in a scrollable log container', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      createdAt: new Date(`2026-01-${String(index + 1).padStart(2, '0')}T12:00:00Z`),
      actorName: `User ${index}`,
      description: `Event ${index}`,
    }));

    const result = buildRoundupActivitiesHtml(rows);
    expect(result.activityCount).toBe(12);
    expect(result.activitiesHtml.match(/<tr>/g)?.length).toBe(12);
    expect(result.activitiesHtml).toContain(`max-height:${BOARD_ACTIVITY_ROUNDUP_LOG_SCROLL_MAX_HEIGHT_PX}px`);
    expect(result.activitiesHtml).toContain('overflow-y:auto');
    expect(result.activitiesHtml).toContain('table-layout:fixed');
    expect(result.activitiesHtml).toContain('white-space:nowrap');
  });

  it('formats period labels', () => {
    const label = formatRoundupPeriodLabel(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-07T23:59:59Z'),
    );
    expect(label).toContain('Jan');
    expect(label).toContain('2026');
  });

  it('escapeHtml leaves safe text unchanged', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });
});

describe('boardActivityWeeklyRoundup recipients', () => {
  const board: BoardMemberScope = {
    ownerId: { toString: () => 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    members: [
      { userId: { toString: () => 'bbbbbbbbbbbbbbbbbbbbbbbb' } },
      { userId: { toString: () => 'cccccccccccccccccccccccc' } },
    ],
  };

  it('builds a member id set including owner', () => {
    const ids = boardMemberUserIdSet(board);
    expect(ids.has('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(ids.has('bbbbbbbbbbbbbbbbbbbbbbbb')).toBe(true);
    expect(ids.size).toBe(3);
  });

  it('filters configured recipients to board members only', () => {
    const filtered = filterRoundupRecipientsToBoardMembers(board, [
      'bbbbbbbbbbbbbbbbbbbbbbbb',
      'dddddddddddddddddddddddd',
      'bbbbbbbbbbbbbbbbbbbbbbbb',
      'cccccccccccccccccccccccc',
    ]);
    expect(filtered).toEqual([
      'bbbbbbbbbbbbbbbbbbbbbbbb',
      'cccccccccccccccccccccccc',
    ]);
  });
});

describe('getWeeklyRoundupWindow', () => {
  it('returns a rolling period ending at the supplied instant', () => {
    const end = new Date('2026-01-08T08:00:00Z');
    const { start, end: windowEnd } = getWeeklyRoundupWindow(end);
    expect(windowEnd).toEqual(end);
    const expectedStart = new Date(
      end.getTime() - BOARD_ACTIVITY_ROUNDUP_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(start.getTime()).toBe(expectedStart.getTime());
  });
});
