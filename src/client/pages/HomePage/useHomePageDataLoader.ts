import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { db, type BoardDB, type WorkspaceDB } from '../../store/database.js';
import { transformWorkspace } from '../../utils/transform.js';
import { replaceDexieWorkspacesFromHomeApiList } from '../../utils/workspaceDexieReconcile.js';
import { HOME_WORKSPACE_SUMMARY_FIELDS, loadAllHomeBoardSummaries } from './homePageData.js';
import { resyncWorkspaceSocketRoomsFromDexie } from '../../hooks/useSocket.js';

interface LoadHomeDataResult {
  readonly transformedWorkspaces: WorkspaceDB[];
  readonly boards: BoardDB[];
}

async function fetchHomeData(): Promise<LoadHomeDataResult> {
  const [workspacesResponse, boards] = await Promise.all([
    api.getWorkspaces({ view: 'summary', fields: [...HOME_WORKSPACE_SUMMARY_FIELDS] }),
    loadAllHomeBoardSummaries(),
  ]);
  const rawWorkspaces = (workspacesResponse as { workspaces: unknown[] }).workspaces;
  const transformedWorkspaces: WorkspaceDB[] = rawWorkspaces.map((workspace) => transformWorkspace(workspace));
  return { transformedWorkspaces, boards };
}

async function persistHomeDataToDexie(
  transformedWorkspaces: WorkspaceDB[],
  boards: BoardDB[],
): Promise<void> {
  await db.transaction('rw', db.workspaces, db.boards, async () => {
    await replaceDexieWorkspacesFromHomeApiList(transformedWorkspaces);
    if (boards.length > 0) {
      await db.boards.bulkPut(boards);
    }
  });
  void resyncWorkspaceSocketRoomsFromDexie();
}

interface UseHomePageDataLoaderParams {
  readonly authenticated: boolean;
  readonly authLoading: boolean;
  readonly isMountedRef: MutableRefObject<boolean>;
  readonly homeDataLoadGenRef: MutableRefObject<number>;
  readonly setLoading: Dispatch<SetStateAction<boolean>>;
  readonly setWorkspaces: Dispatch<SetStateAction<WorkspaceDB[]>>;
  readonly setAllBoards: Dispatch<SetStateAction<BoardDB[]>>;
}

export function useHomePageDataLoader({
  authenticated,
  authLoading,
  isMountedRef,
  homeDataLoadGenRef,
  setLoading,
  setWorkspaces,
  setAllBoards,
}: UseHomePageDataLoaderParams): { readonly refreshData: () => Promise<void> } {
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !authenticated) {
      navigate('/login', { replace: true });
    }
  }, [authenticated, authLoading, navigate]);

  const refreshData = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const { transformedWorkspaces, boards } = await fetchHomeData();
      if (!isMountedRef.current) return;
      setWorkspaces(transformedWorkspaces);
      setAllBoards(boards);
      await persistHomeDataToDexie(transformedWorkspaces, boards);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, [isMountedRef, setAllBoards, setWorkspaces]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!authenticated || authLoading) {
      return undefined;
    }

    const generation = ++homeDataLoadGenRef.current;
    const loadData = async () => {
      if (!isMountedRef.current) return;
      try {
        setLoading(true);
        const { transformedWorkspaces, boards } = await fetchHomeData();
        if (!isMountedRef.current || homeDataLoadGenRef.current !== generation) return;
        setWorkspaces(transformedWorkspaces);
        setAllBoards(boards);
        await persistHomeDataToDexie(transformedWorkspaces, boards);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        if (isMountedRef.current && homeDataLoadGenRef.current === generation) {
          setLoading(false);
        }
      }
    };
    void loadData();
    return () => {
      homeDataLoadGenRef.current += 1;
      isMountedRef.current = false;
    };
  }, [authenticated, authLoading, homeDataLoadGenRef, isMountedRef, setAllBoards, setLoading, setWorkspaces]);

  return { refreshData };
}
