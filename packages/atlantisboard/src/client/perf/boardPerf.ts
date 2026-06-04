/**
 * Lightweight client perf hooks for board bootstrap (extend as needed).
 * Uses Performance API when available; safe no-ops otherwise.
 */
import { env } from '../config/env.js';

function boardPerfDebug(message: string): void {
  /* eslint-disable no-console -- gated dev perf instrumentation */
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug(message);
  }
  /* eslint-enable no-console */
}

export function markBoardBootstrapStart(): () => void {
  if (typeof performance === 'undefined' || typeof performance.now !== 'function') {
    return () => {
      /* noop */
    };
  }
  const t0 = performance.now();
  return () => {
    const ms = performance.now() - t0;
    boardPerfDebug(`[board-perf] bootstrap ${ms.toFixed(1)}ms`);
  };
}

type RealtimePatchMetric = {
  readonly patchedCardCount: number;
  readonly queueDepth: number;
  readonly flushMs: number;
};

function canLogBoardPerf(): boolean {
  return env.BOARD_PERF_INSTRUMENTATION_ENABLED === true;
}

export function logBoardRealtimePatchFlush(metric: RealtimePatchMetric): void {
  if (!canLogBoardPerf()) {
    return;
  }
  boardPerfDebug(
    `[board-perf] realtime.patch.flush cards=${metric.patchedCardCount} queue=${metric.queueDepth} ms=${metric.flushMs.toFixed(1)}`,
  );
}

type AssigneeDirectoryMetric = {
  readonly boardId: string;
  readonly phase: 'first-page' | 'full';
  readonly userCount: number;
  readonly ms: number;
};

export function logAssigneeDirectoryMetric(metric: AssigneeDirectoryMetric): void {
  if (!canLogBoardPerf()) {
    return;
  }
  boardPerfDebug(
    `[board-perf] assignee.directory phase=${metric.phase} board=${metric.boardId} users=${metric.userCount} ms=${metric.ms.toFixed(1)}`,
  );
}
