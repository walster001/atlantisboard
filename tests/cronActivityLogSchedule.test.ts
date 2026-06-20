import { describe, it, expect, afterEach, spyOn, jest } from 'bun:test';
import {
  shouldRunDailyInHour,
  scheduleCronJobs,
  cleanupCronJobs,
} from '../src/server/workers/cronJobs.js';

describe('activity log cron schedule', () => {
  afterEach(() => {
    cleanupCronJobs();
    jest.useRealTimers();
  });

  it('is due at 02:03 when cleanup has not run today', () => {
    const now = new Date(2026, 5, 20, 2, 3, 0);
    expect(shouldRunDailyInHour(now, 2, '')).toEqual({ due: true, dayKey: '2026-06-20' });
  });

  it('is not due twice on the same calendar day', () => {
    const now = new Date(2026, 5, 20, 2, 45, 0);
    expect(shouldRunDailyInHour(now, 2, '2026-06-20')).toEqual({
      due: false,
      dayKey: '2026-06-20',
    });
  });

  it('invokes cleanup on first interval tick when worker starts at 02:03', async () => {
    const startMs = new Date(2026, 5, 20, 2, 3, 0).getTime();
    let nowMs = startMs;
    const RealDate = globalThis.Date;
    globalThis.Date = class MockDate extends RealDate {
      constructor(...args: [] | [number | string | Date] | [number, number, number?, number?, number?, number?, number?]) {
        if (args.length === 0) {
          super(nowMs);
        } else {
          super(...(args as ConstructorParameters<typeof RealDate>));
        }
      }
      static now(): number {
        return nowMs;
      }
    } as DateConstructor;

    jest.useFakeTimers();
    const cronJobs = await import('../src/server/workers/cronJobs.js');
    const cleanupSpy = spyOn(cronJobs, 'cleanupActivityLogs').mockResolvedValue(undefined);

    try {
      scheduleCronJobs();

      nowMs = startMs + 60_000;
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    } finally {
      cleanupSpy.mockRestore();
      globalThis.Date = RealDate;
    }
  });
});
