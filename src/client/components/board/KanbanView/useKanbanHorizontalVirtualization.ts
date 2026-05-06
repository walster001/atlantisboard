import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from 'react';
import type { BoardDB, ListDB } from '../../../store/database.js';
import { getBoardListColumnWidthPx } from '../../../utils/boardListColumnWidth.js';
import { routeBoardClick } from '../boardInteractionBus.js';
import { LIST_HORIZONTAL_GAP_PX, LIST_WINDOW_OVERSCAN_COLUMNS } from './helpers.js';

interface UseKanbanHorizontalVirtualizationArgs {
  readonly board: BoardDB;
  readonly lists: ListDB[];
  readonly suppressCardOpenClickRef: MutableRefObject<boolean>;
}

interface KanbanHorizontalVirtualizationResult {
  readonly mountedLists: ListDB[];
  readonly leftSpacerPx: number;
  readonly rightSpacerPx: number;
  readonly visibleEnd: number;
  readonly totalListCount: number;
  readonly columnsGroupRef: MutableRefObject<HTMLDivElement | null>;
  readonly handleColumnsClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  readonly setColumnsGroupRef: (node: HTMLDivElement | null) => void;
}

export function useKanbanHorizontalVirtualization({
  board,
  lists,
  suppressCardOpenClickRef,
}: UseKanbanHorizontalVirtualizationArgs): KanbanHorizontalVirtualizationResult {
  const columnsGroupRef = useRef<HTMLDivElement | null>(null);
  const boardScrollFrameRef = useRef<HTMLDivElement | null>(null);
  const boardScrollRafRef = useRef<number | null>(null);
  const boardScrollCleanupRef = useRef<(() => void) | null>(null);
  const [boardScrollMetrics, setBoardScrollMetrics] = useState(() => ({
    left: 0,
    viewportWidth: 0,
  }));

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

  const handleColumnsClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const root = columnsGroupRef.current;
    if (root == null) {
      return;
    }
    routeBoardClick(event.nativeEvent, { root, suppressCardOpenClickRef });
  }, [suppressCardOpenClickRef]);

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
      const cleanup = (): void => {
        scrollFrame.removeEventListener('scroll', onScroll);
        ro.disconnect();
        if (boardScrollRafRef.current != null) {
          cancelAnimationFrame(boardScrollRafRef.current);
          boardScrollRafRef.current = null;
        }
      };
      boardScrollCleanupRef.current = cleanup;
    },
    [commitBoardScrollMetrics, scheduleBoardScrollMetricsRead],
  );

  return {
    mountedLists,
    leftSpacerPx,
    rightSpacerPx,
    visibleEnd,
    totalListCount,
    columnsGroupRef,
    handleColumnsClickCapture,
    setColumnsGroupRef,
  };
}
