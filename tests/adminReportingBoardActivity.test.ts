/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { retentionLowerBoundDate } from '../src/shared/boardDayLogRetention.js';
import { parseAdminBoardActivityRow } from '../src/client/components/admin/AdminReportingBoardActivity/adminReportingBoardActivityUtils.js';

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

describe('parseAdminBoardActivityRow', () => {
  it('parses board activity rows with board context', () => {
    const row = parseAdminBoardActivityRow({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      boardId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      boardName: 'Product Roadmap',
      type: 'card.created',
      createdAt: '2026-01-07T16:30:00.000Z',
      userId: { displayName: 'Alex Rivera' },
      metadata: {
        cardTitle: 'Launch checklist',
        listName: 'In progress',
      },
    });

    expect(row).not.toBeNull();
    expect(row?.boardId).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(row?.boardName).toBe('Product Roadmap');
    expect(row?.type).toBe('card.created');
    expect(row?.actorName).toBe('Alex Rivera');
  });

  it('rejects non-board-content activity types', () => {
    const row = parseAdminBoardActivityRow({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      boardId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      boardName: 'Product Roadmap',
      type: 'board.member.add',
      createdAt: '2026-01-07T16:30:00.000Z',
      userId: { displayName: 'Alex Rivera' },
      metadata: {},
    });

    expect(row).toBeNull();
  });
});
