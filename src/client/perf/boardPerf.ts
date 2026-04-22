/**
 * Lightweight client perf hooks for board bootstrap (extend as needed).
 * Uses Performance API when available; safe no-ops otherwise.
 */
export function markBoardBootstrapStart(): () => void {
  if (typeof performance === 'undefined' || typeof performance.now !== 'function') {
    return () => {
      /* noop */
    };
  }
  const t0 = performance.now();
  return () => {
    const ms = performance.now() - t0;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug(`[board-perf] bootstrap ${ms.toFixed(1)}ms`);
    }
  };
}
