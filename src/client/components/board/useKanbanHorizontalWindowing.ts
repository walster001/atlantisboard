import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';
import { getBoardListColumnWidthPx } from '../../utils/boardListColumnWidth.js';
import type { BoardDB, ListDB } from '../../store/database.js';
import { routeBoardClick } from './boardInteractionBus.js';

const LIST_HORIZONTAL_GAP_PX = 12;
const LIST_WINDOW_OVERSCAN_COLUMNS = 2;

interface UseKanbanHorizontalWindowingArgs {
  readonly board: BoardDB;
  readonly lists: readonly ListDB[];
  readonly columnsGroupRef: MutableRefObject<HTMLDivElement | null>;
  readonly suppressCardOpenClickRef: MutableRefObject<boolean>;
}

export function useKanbanHorizontalWindowing({
  board,
  lists,
  columnsGroupRef,
  suppressCardOpenClickRef,
}: UseKanbanHorizontalWindowingArgs) {
  const boardScrollFrameRef = useRef<HTMLDivElement | null>(null);
  const boardScrollRafRef = useRef<number | null>(null);
  const boardScrollCleanupRef = useRef<(() => void) | null>(null);
  const [boardScrollMetrics, setBoardScrollMetrics] = useState(() => ({
    left: 0,
    viewportWidth: 0,
  }));

  const listSlotWidthPx = useMemo(() => {
    const preferred = getBoardListColumnWidthPx(board);
    const responsiveMax = Math.max(200, (Math.max(boardScrollMetrics.viewportWidth, 0) - 120) / 5.25);
    return Math.min(preferred, responsiveMax);
  }, [board, boardScrollMetrics.viewportWidth]);

  const listStridePx = listSlotWidthPx + LIST_HORIZONTAL_GAP_PX;
  const totalListCount = lists.length;
  const visibleStart = Math.max(
    0,
    Math.floor(boardScrollMetrics.left / Math.max(1, listStridePx)) - LIST_WINDOW_OVERSCAN_COLUMNS,
  );
  const estimatedVisibleCount =
    boardScrollMetrics.viewportWidth > 0
      ? Math.ceil(boardScrollMetrics.viewportWidth / Math.max(1, listStridePx))
      : totalListCount;
  const visibleEnd = Math.min(
    totalListCount,
    visibleStart + estimatedVisibleCount + LIST_WINDOW_OVERSCAN_COLUMNS * 2,
  );
  const mountedLists =
    totalListCount > 0 && visibleEnd > visibleStart ? lists.slice(visibleStart, visibleEnd) : lists;
  const leftSpacerPx = visibleStart * listStridePx;
  const rightSpacerPx = Math.max(0, (totalListCount - visibleEnd) * listStridePx);

  const commitBoardScrollMetrics = useCallback((left: number, viewportWidth: number): void => {
    setBoardScrollMetrics((prev) => {
      if (Math.abs(prev.left - left) < 1 && Math.abs(prev.viewportWidth - viewportWidth) < 1) {
        return prev;
      }
      return { left, viewportWidth };
    });
  }, []);

  const scheduleBoardScrollMetricsRead = useCallback((): void => {
    if (boardScrollRafRef.current != null) {
      return;
    }
    boardScrollRafRef.current = requestAnimationFrame(() => {
      boardScrollRafRef.current = null;
      const node = boardScrollFrameRef.current;
      if (node == null) {
        return;
      }
      commitBoardScrollMetrics(node.scrollLeft, node.clientWidth);
    });
  }, [commitBoardScrollMetrics]);

  const handleColumnsClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const root = columnsGroupRef.current;
      if (root == null) {
        return;
      }
      routeBoardClick(event.nativeEvent, { root, suppressCardOpenClickRef });
    },
    [columnsGroupRef, suppressCardOpenClickRef],
  );

  const setColumnsGroupRef = useCallback(
    (node: HTMLDivElement | null): void => {
      boardScrollCleanupRef.current?.();
      boardScrollCleanupRef.current = null;
      columnsGroupRef.current = node;
      if (node == null) {
        boardScrollFrameRef.current = null;
        return;
      }

      const scrollFrame = node.parentElement instanceof HTMLDivElement ? node.parentElement : null;
      boardScrollFrameRef.current = scrollFrame;
      if (scrollFrame == null) {
        return;
      }
      commitBoardScrollMetrics(scrollFrame.scrollLeft, scrollFrame.clientWidth);
      const ro = new ResizeObserver(() => {
        scheduleBoardScrollMetricsRead();
      });
      ro.observe(scrollFrame);
      const onScroll = (): void => {
        scheduleBoardScrollMetricsRead();
      };
      scrollFrame.addEventListener('scroll', onScroll, { passive: true });
      boardScrollCleanupRef.current = () => {
        scrollFrame.removeEventListener('scroll', onScroll);
        ro.disconnect();
        if (boardScrollRafRef.current != null) {
          cancelAnimationFrame(boardScrollRafRef.current);
          boardScrollRafRef.current = null;
        }
      };
    },
    [columnsGroupRef, commitBoardScrollMetrics, scheduleBoardScrollMetricsRead],
  );

  return {
    setColumnsGroupRef,
    handleColumnsClickCapture,
    mountedLists,
    leftSpacerPx,
    rightSpacerPx,
    visibleEnd,
    totalListCount,
    listHorizontalGapPx: LIST_HORIZONTAL_GAP_PX,
  } as const;
}
