/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { retentionLowerBoundDate } from '../src/shared/boardDayLogRetention.js';
import { parseAdminMemberAuditRow } from '../src/client/components/admin/AdminReportingMemberActivity/adminReportingMemberActivityUtils.js';

describe('boardDayLogRetention shared helpers', () => {
  it('returns no lower bound for never expire', () => {
    expect(retentionLowerBoundDate('never')).toBeUndefined();
  });

  it('returns a lower bound for preset retention windows', () => {
    const lowerBound = retentionLowerBoundDate('30');
    expect(lowerBound).toBeInstanceOf(Date);
    expect(lowerBound!.getTime()).toBeLessThan(Date.now());
  });
});

describe('parseAdminMemberAuditRow', () => {
  it('parses member audit rows with board context', () => {
    const row = parseAdminMemberAuditRow({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      boardId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      boardName: 'Product Roadmap',
      type: 'board.member.add',
      createdAt: '2026-01-07T16:30:00.000Z',
      userId: { displayName: 'Alex Rivera' },
      metadata: {
        targetDisplayName: 'Jordan Lee',
        roleKey: 'manager',
      },
    });

    expect(row).not.toBeNull();
    expect(row?.boardId).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(row?.boardName).toBe('Product Roadmap');
    expect(row?.type).toBe('board.member.add');
    expect(row?.actorName).toBe('Alex Rivera');
  });

  it('rejects non-member-audit activity types', () => {
    const row = parseAdminMemberAuditRow({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      boardId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      boardName: 'Product Roadmap',
      type: 'card.move',
      createdAt: '2026-01-07T16:30:00.000Z',
      userId: { displayName: 'Alex Rivera' },
      metadata: {},
    });

    expect(row).toBeNull();
  });
});
