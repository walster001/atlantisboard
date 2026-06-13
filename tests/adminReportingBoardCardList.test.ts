/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  boardListQuerySchema,
  cardListQuerySchema,
} from '../src/server/routes/admin/reportingQuerySchemas.js';
import {
  buildCreatedAtCursorFilter,
  computeNextCreatedAtCursor,
  normalizeBoardName,
  normalizeListName,
  resolveReportingPageLimit,
} from '../src/server/services/adminReportingService/pagination.js';
import {
  ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE,
  ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE,
  ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE,
} from '../src/shared/constants/adminReporting.js';

describe('admin reporting pagination helpers', () => {
  it('clamps page limits to configured bounds', () => {
    expect(
      resolveReportingPageLimit(undefined, ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE, ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE),
    ).toBe(ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE);
    expect(
      resolveReportingPageLimit(500, ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE, ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE),
    ).toBe(ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE);
    expect(
      resolveReportingPageLimit(0, ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE, ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE),
    ).toBe(1);
  });

  it('builds createdAt cursor filters from epoch millis', () => {
    const filter = buildCreatedAtCursorFilter('1700000000000');
    expect(filter?.$lt).toBeInstanceOf(Date);
    expect(filter?.$lt?.getTime()).toBe(1_700_000_000_000);
    expect(buildCreatedAtCursorFilter('')).toBeUndefined();
    expect(buildCreatedAtCursorFilter('not-a-number')).toBeUndefined();
  });

  it('computes next cursor when an extra row is present', () => {
    const createdAt = new Date('2026-01-07T16:30:00.000Z');
    const nextCursor = computeNextCreatedAtCursor([{ createdAt }, { createdAt: new Date('2026-01-06T12:00:00.000Z') }], 1);
    expect(nextCursor).toBe(String(createdAt.getTime()));
    expect(computeNextCreatedAtCursor([{ createdAt }], 1)).toBeUndefined();
  });

  it('normalizes empty board names', () => {
    expect(normalizeBoardName('  Roadmap  ')).toBe('Roadmap');
    expect(normalizeBoardName('')).toBe('Untitled board');
    expect(normalizeBoardName(undefined)).toBe('Untitled board');
  });

  it('normalizes empty list names', () => {
    expect(normalizeListName('  Backlog  ')).toBe('Backlog');
    expect(normalizeListName('')).toBe('Untitled list');
    expect(normalizeListName(undefined)).toBe('Untitled list');
  });
});

describe('admin reporting board/card list query schemas', () => {
  it('accepts valid pagination params for board list', () => {
    const result = boardListQuerySchema.safeParse({ limit: '25', cursor: '1700000000000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.cursor).toBe('1700000000000');
    }
  });

  it('rejects board list limits above the configured maximum', () => {
    const result = boardListQuerySchema.safeParse({
      limit: String(ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid pagination params for card list', () => {
    const result = cardListQuerySchema.safeParse({ limit: '40' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(40);
    }
  });

  it('rejects card list limits above the configured maximum', () => {
    const result = cardListQuerySchema.safeParse({
      limit: String(ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE + 1),
    });
    expect(result.success).toBe(false);
  });
});
