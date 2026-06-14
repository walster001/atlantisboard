/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  computeEffectiveActivityCutoffDate,
  parseAdminReportingDaysFilter,
  resolveStoredBoardRetentionDays,
} from '../src/shared/adminReportingActivityRetention.js';
import { BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS } from '../src/shared/constants/boardMemberAuditActivities.js';

describe('resolveStoredBoardRetentionDays', () => {
  it('treats null as never expire', () => {
    expect(resolveStoredBoardRetentionDays(null, 30)).toBeNull();
  });

  it('uses default when unset', () => {
    expect(resolveStoredBoardRetentionDays(undefined, 30)).toBe(30);
  });

  it('uses explicit board retention', () => {
    expect(resolveStoredBoardRetentionDays(90, 30)).toBe(90);
  });
});

describe('computeEffectiveActivityCutoffDate', () => {
  const now = Date.parse('2026-06-07T12:00:00.000Z');

  it('applies only board default when user filter is all', () => {
    const cutoff = computeEffectiveActivityCutoffDate(undefined, undefined, 30, now);
    expect(cutoff?.toISOString()).toBe('2026-05-08T12:00:00.000Z');
  });

  it('applies no cutoff when board never expires and user filter is all', () => {
    expect(computeEffectiveActivityCutoffDate(null, undefined, 30, now)).toBeUndefined();
  });

  it('uses the stricter of user filter and board retention', () => {
    const cutoff = computeEffectiveActivityCutoffDate(30, 10, BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS, now);
    expect(cutoff?.toISOString()).toBe('2026-05-28T12:00:00.000Z');
  });

  it('caps user filter by board retention when board is shorter', () => {
    const cutoff = computeEffectiveActivityCutoffDate(30, 90, BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS, now);
    expect(cutoff?.toISOString()).toBe('2026-05-08T12:00:00.000Z');
  });
});

describe('parseAdminReportingDaysFilter', () => {
  it('returns undefined for all', () => {
    expect(parseAdminReportingDaysFilter('all')).toBeUndefined();
  });

  it('parses numeric day filters', () => {
    expect(parseAdminReportingDaysFilter('30')).toBe(30);
  });
});
