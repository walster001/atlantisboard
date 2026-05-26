import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext.js';
import { useAppBranding } from '../../contexts/AppBrandingContext.js';
import { useHomeBoardPermissionsBatch } from '../../hooks/useHomeBoardPermissionsBatch.js';
import { useHomePageCapabilities } from '../../hooks/useHomePageCapabilities.js';
import { useHomeWorkspacePermissionsBatch } from '../../hooks/useHomeWorkspacePermissionsBatch.js';
import {
  buildBoardsByWorkspaceSortedMap,
  mergeWorkspacesWithHomeOrder,
} from '../../hooks/homeBoard/homeBoardLayout.js';
import { persistWorkspaceRowOrder } from '../../hooks/homeBoard/homeBoardMove.js';
import { useBoardRealtimeSync } from '../../hooks/homeBoard/useBoardRealtimeSync.js';
import { fullWorkspaceInsertBeforeIndex } from '../../hooks/home/homePointerHitTest.js';
import {
  useHomePagePointerDrag,
  type BoardDropIndicator,
  type HomeBoardLongPressUi,
  type HomePagePointerDragActions,
  type HomePagePointerDragModels,
  type HomePagePointerDragRefs,
} from '../../hooks/home/useHomePagePointerDrag.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { useSocket } from '../../hooks/useSocket.js';
import {
  resolveHomepageNavbarIconUrl,
  resolveHomepageNavbarLabelText,
} from '../../../shared/types/appBranding.js';
import type { BoardDB, WorkspaceDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { useHomePageDataLoader } from './useHomePageDataLoader.js';
export interface HomePageQuickTarget {
  readonly id: string;
  readonly initialName?: string;
  readonly initialDescription?: string;
}

export interface HomePageController {
  readonly loading: boolean;
  readonly showCreateWorkspace: boolean;
  readonly showCreateBoard: boolean;
  readonly selectedWorkspaceIdForBoard: string | null;
  readonly showImportModal: boolean;
  readonly hoveredBoardId: string | null;
  readonly renameWorkspaceTarget: HomePageQuickTarget | null;
  readonly editDescriptionTarget: HomePageQuickTarget | null;
  readonly workspaceSettingsId: string | null;
  readonly orderedWorkspaces: readonly WorkspaceDB[];
  readonly boardsByWorkspaceMap: ReadonlyMap<string, readonly BoardDB[]>;
  readonly boardGridDropTargetWsId: string | null;
  readonly draggingBoardId: string | null;
  readonly boardLongPressUi: HomeBoardLongPressUi | null;
  readonly boardDropIndicator: BoardDropIndicator;
  readonly workspaceInsertLineBeforeFullIndex: number;
  readonly isMobile: boolean;
  readonly responsiveTier: 'mobile' | 'tablet' | 'desktop';
  readonly homeNavLabel: string;
  readonly homeNavLabelStyle: CSSProperties;
  readonly homeNavIconUrl: string | null;
  readonly homeNavIconPx: number;
  readonly homeNavbarColor: string;
  readonly homePageRootStyle: CSSProperties;
  readonly homeMainStyle: CSSProperties;
  readonly homeUserNameStyle: CSSProperties;
  readonly homePageDragging: boolean;
  readonly floatPreview: { readonly kind: 'board' | 'workspace'; readonly name: string } | null;
  readonly listRootRef: RefObject<HTMLDivElement | null>;
  readonly floatHostRef: RefObject<HTMLDivElement | null>;
  readonly suppressBoardClickRef: MutableRefObject<boolean>;
  readonly canShowBoardCardMenu: (boardId: string) => boolean;
  readonly canDragBoardOnHome: (board: BoardDB) => boolean;
  readonly canManageWorkspace: (workspace: WorkspaceDB) => boolean;
  readonly canUpdateWorkspace: (workspace: WorkspaceDB) => boolean;
  readonly canDeleteWorkspace: (workspaceId: string) => boolean;
  readonly canCreateBoardInWorkspace: (workspace: WorkspaceDB) => boolean;
  readonly openBoard: (boardId: string) => void;
  readonly refreshData: () => Promise<void>;
  readonly setHoveredBoardId: (boardId: string | null) => void;
  readonly canCreateWorkspace: boolean;
  readonly canUseImport: boolean;
  readonly openCreateWorkspace: () => void;
  readonly closeCreateWorkspace: () => void;
  readonly openCreateBoard: (workspaceId: string) => void;
  readonly closeCreateBoard: () => void;
  readonly openImportModal: () => void;
  readonly closeImportModal: () => void;
  readonly openRenameWorkspace: (workspace: WorkspaceDB) => void;
  readonly closeRenameWorkspace: () => void;
  readonly openEditDescription: (workspace: WorkspaceDB) => void;
  readonly closeEditDescription: () => void;
  readonly openWorkspaceSettings: (workspaceId: string) => void;
  readonly closeWorkspaceSettings: () => void;
  readonly handleDeleteWorkspace: (workspaceId: string) => void;
}

export function useHomePageController(): HomePageController {
  const [loading, setLoading] = useState(true);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [selectedWorkspaceIdForBoard, setSelectedWorkspaceIdForBoard] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [hoveredBoardId, setHoveredBoardId] = useState<string | null>(null);
  const [renameWorkspaceTarget, setRenameWorkspaceTarget] = useState<HomePageQuickTarget | null>(null);
  const [editDescriptionTarget, setEditDescriptionTarget] = useState<HomePageQuickTarget | null>(null);
  const [workspaceSettingsId, setWorkspaceSettingsId] = useState<string | null>(null);
  const { authenticated, loading: authLoading, user, refreshUser } = useAuthContext();
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const { branding: loginBranding, appBranding: appChrome } = useAppBranding();
  useSocket();

  const navigate = useNavigate();
  const homeNavLabel = resolveHomepageNavbarLabelText(appChrome, loginBranding);
  const homeNavLabelStyle: CSSProperties = { color: appChrome.homepageNavbarTextColor };
  const homeNavIconUrl = resolveHomepageNavbarIconUrl(appChrome, loginBranding);
  const homeNavIconPx = appChrome.homepageNavbarIconSizePx;
  const homeNavbarColor = appChrome.homepageNavbarColor;
  const homePageRootStyle: CSSProperties =
    appChrome.homepageBackgroundMode === 'image' && appChrome.homepageBackgroundImageUrl?.trim()
      ? {
          backgroundImage: `url(${appChrome.homepageBackgroundImageUrl.trim()})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: appChrome.homepageBackgroundColor,
        }
      : { backgroundColor: appChrome.homepageBackgroundColor };
  const homeMainStyle: CSSProperties = { backgroundColor: 'transparent' };
  const homeUserNameStyle: CSSProperties = { color: appChrome.homepageNavbarTextColor };
  const isMountedRef = useRef(true);
  const homeDataLoadGenRef = useRef(0);
  const { allBoards, setAllBoards, workspaces, setWorkspaces } = useBoardRealtimeSync({ isMountedRef });
  const homePerms = useHomeBoardPermissionsBatch(user?.id, allBoards);
  const wsPerms = useHomeWorkspacePermissionsBatch(user?.id, workspaces);
  const { capabilities: homeCapabilities } = useHomePageCapabilities(user?.id, user?.isAppAdmin);

  const orderedWorkspaces = useMemo(
    () => mergeWorkspacesWithHomeOrder(workspaces, user?.preferences?.homeWorkspaceOrder),
    [workspaces, user?.preferences?.homeWorkspaceOrder],
  );
  const boardsByWorkspaceMap = useMemo(() => buildBoardsByWorkspaceSortedMap(allBoards), [allBoards]);

  const listRootRef = useRef<HTMLDivElement | null>(null);
  const floatHostRef = useRef<HTMLDivElement | null>(null);
  const previewPositionRef = useRef({ x: 0, y: 0 });
  const previewMetricsRef = useRef({ width: 220, height: 120 });
  const [workspaceRowDrag, setWorkspaceRowDrag] = useState<{ workspaceId: string | null; insertIndex: number | null }>({
    workspaceId: null,
    insertIndex: null,
  });
  const [homePageDragging, setHomePageDragging] = useState(false);
  const [boardGridDropTargetWsId, setBoardGridDropTargetWsId] = useState<string | null>(null);

  const modelsRef = useRef<HomePagePointerDragModels>({
    boards: [],
    orderedWorkspaceIds: [],
    workspaces: [],
    userId: undefined,
  });
  modelsRef.current = {
    boards: allBoards,
    orderedWorkspaceIds: orderedWorkspaces.map((workspace) => workspace.id),
    workspaces: orderedWorkspaces,
    userId: user?.id,
  };

  const persistWorkspaceOrder = useCallback(
    async (orderedIds: string[]) => {
      await persistWorkspaceRowOrder(orderedIds);
      await refreshUser();
    },
    [refreshUser],
  );

  const actionsRef = useRef<HomePagePointerDragActions>(null!);
  actionsRef.current = {
    setAllBoards,
    setWorkspaceRowDrag,
    setBoardGridDropTarget: setBoardGridDropTargetWsId,
    setHomeDraggingClass: setHomePageDragging,
    canDragBoard: (board) => homePerms.canDragBoardOnHome(board),
    canReorderAllBoardsInWorkspace: (workspaceId) =>
      user != null &&
      homePerms.canReorderAllBoardsInScope(user.id, boardsByWorkspaceMap.get(workspaceId.trim()) ?? []),
    hasBoardUpdate: homePerms.hasBoardUpdate,
    hasWorkspaceUpdate: (workspaceId) =>
      user != null && wsPerms.loaded && wsPerms.can(workspaceId, 'workspaces.update'),
    persistWorkspaceOrder,
    onMoveError: (message) => {
      notifications.show({ title: 'Error', message, color: 'red' });
    },
  };

  const pointerDragRefs: HomePagePointerDragRefs = {
    listRootRef,
    floatHostRef,
    previewPositionRef,
    previewMetricsRef,
  };
  const { suppressBoardClickRef, floatPreview, draggingBoardId, boardLongPressUi, boardDropIndicator } = useHomePagePointerDrag(
    pointerDragRefs,
    modelsRef,
    actionsRef,
    !loading && !authLoading && authenticated,
    isMobile,
  );

  const { refreshData } = useHomePageDataLoader({
    authenticated,
    authLoading,
    isMountedRef,
    homeDataLoadGenRef,
    setLoading,
    setWorkspaces,
    setAllBoards,
  });

  const handleDeleteWorkspace = useCallback(
    (workspaceId: string) => {
      modals.openConfirmModal({
        title: 'Delete workspace?',
        centered: true,
        children: 'This will permanently delete the workspace and all its boards. This action cannot be undone.',
        labels: { confirm: 'Delete workspace', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          try {
            await api.deleteWorkspace(workspaceId);
            await refreshData();
            notifications.show({
              title: 'Workspace deleted',
              message: 'The workspace has been permanently deleted.',
              color: 'green',
            });
          } catch (error) {
            console.error('Error deleting workspace:', error);
            notifications.show({
              title: 'Error',
              message: 'Failed to delete workspace.',
              color: 'red',
            });
          }
        },
      });
    },
    [refreshData],
  );

  const canUpdateWorkspace = useCallback(
    (workspace: WorkspaceDB): boolean =>
      user != null &&
      (workspace.ownerId === user.id || (wsPerms.loaded && wsPerms.can(workspace.id, 'workspaces.update'))),
    [user, wsPerms],
  );
  const canManageWorkspace = useCallback(
    (workspace: WorkspaceDB): boolean =>
      user != null &&
      wsPerms.loaded &&
      (wsPerms.can(workspace.id, 'workspaces.update') || wsPerms.can(workspace.id, 'workspaces.delete')),
    [user, wsPerms],
  );
  const canDeleteWorkspace = useCallback(
    (workspaceId: string): boolean => user != null && wsPerms.loaded && wsPerms.can(workspaceId, 'workspaces.delete'),
    [user, wsPerms],
  );
  const canCreateBoardInWorkspace = useCallback(
    (workspace: WorkspaceDB): boolean =>
      user != null &&
      (workspace.ownerId === user.id || (wsPerms.loaded && wsPerms.can(workspace.id, 'boards.create'))),
    [user, wsPerms],
  );
  const canShowBoardCardMenu = useCallback(
    (boardId: string): boolean => homePerms.loaded && homePerms.can(boardId, 'boards.update'),
    [homePerms],
  );
  const canDragBoardOnHome = useCallback((board: BoardDB): boolean => homePerms.canDragBoardOnHome(board), [homePerms]);

  const orderedWorkspaceIds = orderedWorkspaces.map((workspace) => workspace.id);
  const workspaceInsertLineBeforeFullIndex =
    workspaceRowDrag.workspaceId != null && workspaceRowDrag.insertIndex != null
      ? fullWorkspaceInsertBeforeIndex(
          orderedWorkspaceIds,
          workspaceRowDrag.workspaceId,
          workspaceRowDrag.insertIndex,
        )
      : -1;

  return {
    loading,
    showCreateWorkspace,
    showCreateBoard,
    selectedWorkspaceIdForBoard,
    showImportModal,
    hoveredBoardId,
    renameWorkspaceTarget,
    editDescriptionTarget,
    workspaceSettingsId,
    orderedWorkspaces,
    boardsByWorkspaceMap,
    boardGridDropTargetWsId,
    draggingBoardId,
    boardLongPressUi,
    boardDropIndicator,
    workspaceInsertLineBeforeFullIndex,
    isMobile,
    responsiveTier,
    homeNavLabel,
    homeNavLabelStyle,
    homeNavIconUrl,
    homeNavIconPx,
    homeNavbarColor,
    homePageRootStyle,
    homeMainStyle,
    homeUserNameStyle,
    homePageDragging,
    floatPreview,
    listRootRef,
    floatHostRef,
    suppressBoardClickRef,
    canShowBoardCardMenu,
    canDragBoardOnHome,
    canManageWorkspace,
    canUpdateWorkspace,
    canDeleteWorkspace,
    canCreateBoardInWorkspace,
    canCreateWorkspace: homeCapabilities.canCreateWorkspace,
    canUseImport: homeCapabilities.canUseImport,
    openBoard: (boardId) => navigate(`/boards/${boardId}`),
    refreshData,
    setHoveredBoardId,
    openCreateWorkspace: () => {
      if (!homeCapabilities.canCreateWorkspace) {
        return;
      }
      setShowCreateWorkspace(true);
    },
    closeCreateWorkspace: () => setShowCreateWorkspace(false),
    openCreateBoard: (workspaceId) => {
      setSelectedWorkspaceIdForBoard(workspaceId);
      setShowCreateBoard(true);
    },
    closeCreateBoard: () => {
      setShowCreateBoard(false);
      setSelectedWorkspaceIdForBoard(null);
    },
    openImportModal: () => {
      if (!homeCapabilities.canUseImport) {
        return;
      }
      setShowImportModal(true);
    },
    closeImportModal: () => setShowImportModal(false),
    openRenameWorkspace: (workspace) =>
      setRenameWorkspaceTarget({ id: workspace.id, initialName: workspace.name ?? '' }),
    closeRenameWorkspace: () => setRenameWorkspaceTarget(null),
    openEditDescription: (workspace) =>
      setEditDescriptionTarget({ id: workspace.id, initialDescription: workspace.description ?? '' }),
    closeEditDescription: () => setEditDescriptionTarget(null),
    openWorkspaceSettings: (workspaceId) => setWorkspaceSettingsId(workspaceId),
    closeWorkspaceSettings: () => setWorkspaceSettingsId(null),
    handleDeleteWorkspace,
  };
}
