/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { boardActivitiesQuerySchema } from '../src/server/routes/activities.js';

function parseQuery(input: Record<string, string | undefined>) {
  return boardActivitiesQuerySchema.safeParse(input);
}

describe('GET /activities/boards/:id boardActivity query', () => {
  it('requires dayStart and dayEnd when boardActivity is true', () => {
    const result = parseQuery({ boardActivity: 'true' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('dayStart'))).toBe(true);
    }
  });

  it('accepts a valid single-day window', () => {
    const dayStart = String(Date.UTC(2026, 5, 8, 0, 0, 0));
    const dayEnd = String(Date.UTC(2026, 5, 8, 23, 59, 59, 999));
    const result = parseQuery({ boardActivity: 'true', dayStart, dayEnd });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.boardActivity).toBe('true');
      expect(result.data.dayStart).toBe(Number(dayStart));
      expect(result.data.dayEnd).toBe(Number(dayEnd));
    }
  });

  it('rejects memberAudit and boardActivity together', () => {
    const dayStart = '0';
    const dayEnd = '1000';
    const result = parseQuery({
      memberAudit: 'true',
      boardActivity: 'true',
      dayStart,
      dayEnd,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('cannot be used together')),
      ).toBe(true);
    }
  });

  it('rejects spans larger than one local calendar day', () => {
    const dayStart = '0';
    const dayEnd = String(50 * 60 * 60 * 1000);
    const result = parseQuery({ boardActivity: '1', dayStart, dayEnd });
    expect(result.success).toBe(false);
  });
});
