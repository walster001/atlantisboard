/**
 * Mobile board body scroll uses CSS scroll-snap; iOS Safari sometimes leaves `scrollLeft`
 * between columns. We measure the real column stride from layout and snap after inertia ends.
 */

const DEFAULT_MIN_DELTA_PX = 3;

function parseGapPx(row: HTMLElement): number {
  const raw = getComputedStyle(row).gap?.trim() ?? '';
  const first = raw.split(/\s+/)[0] ?? '';
  const n = Number.parseFloat(first);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Distance from `scrollLeft` 0 to the next column start (two `.board-column` roots). */
export function measureBoardListStridePx(boardBody: HTMLElement): number | null {
  const row = boardBody.querySelector('.board-page__columns');
  if (!(row instanceof HTMLElement)) {
    return null;
  }
  const gapPx = parseGapPx(row);
  const columns = boardBody.querySelectorAll('.board-column');
  if (columns.length >= 2) {
    const a = columns[0] as HTMLElement;
    const b = columns[1] as HTMLElement;
    const stride = b.offsetLeft - a.offsetLeft;
    return stride > 0 ? stride : null;
  }
  if (columns.length === 1) {
    const one = columns[0] as HTMLElement;
    const stride = one.offsetWidth + gapPx;
    return stride > 0 ? stride : null;
  }
  return null;
}

export function snapBoardBodyToNearestListColumn(
  boardBody: HTMLElement,
  options?: { readonly minDeltaPx?: number; readonly behavior?: ScrollBehavior },
): void {
  const stride = measureBoardListStridePx(boardBody);
  if (stride == null || stride <= 0) {
    return;
  }
  const minDelta = options?.minDeltaPx ?? DEFAULT_MIN_DELTA_PX;
  /** Prefer `auto` on iOS so correction does not stack on top of scroll-snap momentum. */
  const behavior = options?.behavior ?? 'auto';
  const max = Math.max(0, boardBody.scrollWidth - boardBody.clientWidth);
  const raw = boardBody.scrollLeft;
  const idx = Math.round(raw / stride);
  const target = Math.min(Math.max(0, idx * stride), max);
  if (Math.abs(raw - target) < minDelta) {
    return;
  }
  boardBody.scrollTo({ left: target, behavior });
}
