import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { BoardDB, WorkspaceDB } from '../../store/database.js';
import {
  subscribeSocketBoardCreated,
  subscribeSocketBoardDeleted,
  subscribeSocketBoardUpdated,
  subscribeSocketHomeBoardsPositionsSynced,
  subscribeSocketWorkspaceCreated,
  subscribeSocketWorkspaceDeleted,
  subscribeSocketWorkspaceUpdated,
} from '../../utils/socketRealtimeBridge.js';
import {
  boardIdKey,
  mergeHomePositionsSyncIntoBoards,
  sortBoardsFlatHome,
} from './homeBoardLayout.js';

export interface UseBoardRealtimeSyncOptions {
  readonly isMountedRef: MutableRefObject<boolean>;
}

/**
 * Home board list + workspace rows from API hydration, merged with socket updates.
 * Subscriptions use `socketRealtimeBridge` fan-out; cleanup removes only this hook's handlers.
 */
export function useBoardRealtimeSync(options: UseBoardRealtimeSyncOptions): {
  readonly allBoards: BoardDB[];
  readonly setAllBoards: Dispatch<SetStateAction<BoardDB[]>>;
  readonly workspaces: WorkspaceDB[];
  readonly setWorkspaces: Dispatch<SetStateAction<WorkspaceDB[]>>;
} {
  const { isMountedRef } = options;
  const [allBoards, setAllBoards] = useState<BoardDB[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceDB[]>([]);

  /**
   * Same `boards:positionsSynced` may be delivered more than once (e.g. workspace + user fan-out).
   * Dedupe by payload identity so we do not double-merge.
   */
  const lastHomePositionsDedupeKeyRef = useRef<string>('');

  useEffect(() => {
    const upsertBoardInHomeState = (board: BoardDB): void => {
      if (!isMountedRef.current) {
        return;
      }
      setAllBoards((prev) => {
        const k = boardIdKey(board.id);
        const without = prev.filter((b) => boardIdKey(b.id) !== k);
        const next = [...without, board];
        return sortBoardsFlatHome(next);
      });
    };

    const upsertWorkspaceInHomeState = (workspace: WorkspaceDB): void => {
      if (!isMountedRef.current) {
        return;
      }
      setWorkspaces((prev) => {
        const i = prev.findIndex((w) => w.id === workspace.id);
        const next = i < 0 ? [...prev, workspace] : prev.map((w, idx) => (idx === i ? workspace : w));
        return [...next].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
    };

    const unsubUpdated = subscribeSocketBoardUpdated(({ board }) => {
      upsertBoardInHomeState(board);
    });
    const unsubCreated = subscribeSocketBoardCreated(({ board }) => {
      upsertBoardInHomeState(board);
    });
    const unsubDeleted = subscribeSocketBoardDeleted(({ boardId }) => {
      if (!isMountedRef.current) {
        return;
      }
      setAllBoards((prev) => prev.filter((b) => b.id !== boardId));
    });
    const unsubWsUpdated = subscribeSocketWorkspaceUpdated(({ workspace }) => {
      upsertWorkspaceInHomeState(workspace);
    });
    const unsubWsCreated = subscribeSocketWorkspaceCreated(({ workspace }) => {
      upsertWorkspaceInHomeState(workspace);
    });
    const unsubWsDeleted = subscribeSocketWorkspaceDeleted(({ workspaceId }) => {
      if (!isMountedRef.current) {
        return;
      }
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
    });
    const unsubHomePositions = subscribeSocketHomeBoardsPositionsSynced(
      ({ workspaceId, orderedBoardIds, sequence, serverTs }) => {
        if (!isMountedRef.current) {
          return;
        }
        const dedupeKey = `${workspaceId}:${sequence ?? 'na'}:${serverTs ?? 'na'}:${orderedBoardIds.join(',')}`;
        if (dedupeKey === lastHomePositionsDedupeKeyRef.current) {
          return;
        }
        lastHomePositionsDedupeKeyRef.current = dedupeKey;
        setAllBoards((prev) => {
          const { next, touched } = mergeHomePositionsSyncIntoBoards(
            prev,
            workspaceId,
            orderedBoardIds,
          );
          return touched ? next : prev;
        });
      },
    );
    return () => {
      unsubUpdated();
      unsubCreated();
      unsubDeleted();
      unsubWsUpdated();
      unsubWsCreated();
      unsubWsDeleted();
      unsubHomePositions();
    };
  }, []);

  return {
    allBoards,
    setAllBoards,
    workspaces,
    setWorkspaces,
  };
}
