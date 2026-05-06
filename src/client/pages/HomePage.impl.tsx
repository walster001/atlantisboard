import {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  Fragment,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconGripVertical,
  IconLayoutKanbanFilled,
  IconPlus,
  IconFileImport,
} from '@tabler/icons-react';
import { Button, Card, Loader, Stack, Text, Title, Group, Box, Menu, ActionIcon } from '@mantine/core';
import { useAuthContext } from '../contexts/AuthContext.js';
import { useAppBranding } from '../contexts/AppBrandingContext.js';
import {
  resolveHomepageNavbarIconUrl,
  resolveHomepageNavbarLabelText,
} from '../../shared/types/appBranding.js';
import { useHomeBoardPermissionsBatch } from '../hooks/useHomeBoardPermissionsBatch.js';
import { useHomeWorkspacePermissionsBatch } from '../hooks/useHomeWorkspacePermissionsBatch.js';
import { useSocket, resyncWorkspaceSocketRoomsFromDexie } from '../hooks/useSocket.js';
import { api } from '../utils/api.js';
import { db, type BoardDB, type WorkspaceDB } from '../store/database.js';
import { transformBoard, transformWorkspace } from '../utils/transform.js';
import { replaceDexieWorkspacesFromHomeApiList } from '../utils/workspaceDexieReconcile.js';
import { OfflineIndicator } from '../components/OfflineIndicator.js';
import { UserMenu } from '../components/UserMenu.js';
import { CreateWorkspaceModal } from '../components/workspace/CreateWorkspaceModal.js';
import { CreateBoardModal } from '../components/workspace/CreateBoardModal.js';
import { WorkspaceSettingsModal } from '../components/workspace/WorkspaceSettingsModal.js';
import {
  RenameWorkspaceModal,
  EditWorkspaceDescriptionModal,
} from '../components/workspace/WorkspaceHomeQuickEditModals.js';
import { ImportExportModal } from '../components/import-export/ImportExportModal.js';
import { BoardCardMenu } from '../components/board/BoardCardMenu.js';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  buildBoardsByWorkspaceSortedMap,
  mergeWorkspacesWithHomeOrder,
} from '../hooks/homeBoard/homeBoardLayout.js';
import { persistWorkspaceRowOrder } from '../hooks/homeBoard/homeBoardMove.js';
import { useResponsiveTier } from '../hooks/useResponsiveTier.js';
import { useBoardRealtimeSync } from '../hooks/homeBoard/useBoardRealtimeSync.js';
import { fullWorkspaceInsertBeforeIndex } from '../hooks/home/homePointerHitTest.js';
import {
  useHomePagePointerDrag,
  type HomePagePointerDragActions,
  type HomePagePointerDragModels,
  type HomePagePointerDragRefs,
} from '../hooks/home/useHomePagePointerDrag.js';
import { resolveHomeBoardTileCoverDisplay } from '../utils/boardCoverDisplay.js';
import './HomePage.css';

const HOME_BOARDS_PAGE_SIZE = 100;

const HOME_BOARD_CARD_ROOT_STYLES = { root: { overflow: 'visible' } } as const;

const HOME_WORKSPACE_SUMMARY_FIELDS = [
  'name',
  'description',
  'ownerId',
  'members',
  'createdAt',
  'updatedAt',
  'boardScopedHomeOnly',
] as const;

const HOME_BOARD_SUMMARY_FIELDS = [
  'workspaceId',
  'position',
  'name',
  'description',
  'background',
  'visibility',
  'ownerId',
  'members',
  'createdAt',
  'updatedAt',
] as const;

async function loadAllHomeBoardSummaries(): Promise<BoardDB[]> {
  const acc: BoardDB[] = [];
  let skip = 0;
  for (;;) {
    const boardsResponse = await api.getBoards({
      view: 'summary',
      fields: [...HOME_BOARD_SUMMARY_FIELDS],
      skip,
      limit: HOME_BOARDS_PAGE_SIZE,
    });
    const rawBoards = boardsResponse.boards;
    acc.push(...rawBoards.map((board) => transformBoard(board)));
    if (boardsResponse.hasMore !== true || rawBoards.length < HOME_BOARDS_PAGE_SIZE) {
      break;
    }
    skip += HOME_BOARDS_PAGE_SIZE;
  }
  return acc;
}

interface HomeBoardCardTileProps {
  board: BoardDB;
  workspaceId: string;
  showBoardCardMenu: boolean;
  /** Whole tile is draggable when true (Kanban-style deadzone distinguishes drag vs click). */
  boardDraggable: boolean;
  isDraggingSource: boolean;
  suppressNavigateRef: MutableRefObject<boolean>;
  hoveredBoardId: string | null;
  onHover: (id: string | null) => void;
  onOpenBoard: (id: string) => void;
  onRefresh: () => void | Promise<void>;
}

function HomeBoardCardTile({
  board,
  workspaceId,
  showBoardCardMenu,
  boardDraggable,
  isDraggingSource,
  suppressNavigateRef,
  hoveredBoardId,
  onHover,
  onOpenBoard,
  onRefresh,
}: HomeBoardCardTileProps) {
  const cover = resolveHomeBoardTileCoverDisplay(board.background);

  return (
    <Card
      data-home-board-id={board.id}
      data-home-workspace-id={workspaceId}
      {...(boardDraggable ? { 'data-home-board-draggable': '1' } : {})}
      shadow="md"
      padding={0}
      radius="md"
      styles={HOME_BOARD_CARD_ROOT_STYLES}
      className={`home-page__board-card${isDraggingSource ? ' home-page__board-card--drag-source' : ''}`}
      onClick={() => {
        if (suppressNavigateRef.current) {
          return;
        }
        onOpenBoard(board.id);
      }}
      onMouseEnter={() => onHover(board.id)}
      onMouseLeave={() => onHover(null)}
    >
      <Box
        p="md"
        className={`home-page__board-card-header${cover.isImageBackground ? ' home-page__board-card-header--image' : ''}`}
        style={cover.headerStyle}
      >
          <Group justify="space-between" align="end" wrap="nowrap" gap="xs" w="100%">
            <Text
              fw={700}
              fz="xl"
              c={cover.headerTextColor}
              className="home-page__board-card-title"
              style={{ flex: 1, minWidth: 0 }}
            >
              {board.name}
            </Text>
            {showBoardCardMenu ? (
              <Box
                data-home-board-no-drag="1"
                style={{ flexShrink: 0, opacity: hoveredBoardId === board.id ? 1 : 0 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <BoardCardMenu
                  boardId={board.id}
                  boardName={board.name}
                  boardDescription={board.description ?? ''}
                  boardBackground={board.background ?? ''}
                  menuIconColor={cover.menuIconColor}
                  onBoardUpdated={onRefresh}
                  onBoardDeleted={onRefresh}
                />
              </Box>
            ) : null}
          </Group>
        </Box>
        <Box p="md" className="home-page__board-card-body">
          {board.description?.trim() ? (
            <Text size="md" fw={400} c="dimmed" className="home-page__board-card-desc">
              {board.description.trim()}
            </Text>
          ) : null}
        </Box>
      </Card>
  );
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [selectedWorkspaceIdForBoard, setSelectedWorkspaceIdForBoard] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [hoveredBoardId, setHoveredBoardId] = useState<string | null>(null);
  const [renameWorkspaceTarget, setRenameWorkspaceTarget] = useState<{
    id: string;
    initialName: string;
  } | null>(null);
  const [editDescriptionTarget, setEditDescriptionTarget] = useState<{
    id: string;
    initialDescription: string;
  } | null>(null);
  const [workspaceSettingsId, setWorkspaceSettingsId] = useState<string | null>(null);
  const { authenticated, loading: authLoading, user, refreshUser } = useAuthContext();
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const { branding: loginBranding, appBranding: appChrome } = useAppBranding();
  useSocket();
  const navigate = useNavigate();

  const homeNavLabel = resolveHomepageNavbarLabelText(appChrome, loginBranding);
  const homeNavLabelStyle: CSSProperties = {
    color: appChrome.homepageNavbarTextColor,
  };
  const homeNavIconUrl = resolveHomepageNavbarIconUrl(appChrome, loginBranding);
  const homeNavIconPx = appChrome.homepageNavbarIconSizePx;
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
  /** Home board list from API + socket (`board:*`, `boards:positionsSynced`). */
  const { allBoards, setAllBoards, workspaces, setWorkspaces } = useBoardRealtimeSync({
    isMountedRef,
  });

  const homePerms = useHomeBoardPermissionsBatch(user?.id, allBoards);

  const wsPerms = useHomeWorkspacePermissionsBatch(user?.id, workspaces);

  const orderedWorkspaces = useMemo(
    () => mergeWorkspacesWithHomeOrder(workspaces, user?.preferences?.homeWorkspaceOrder),
    [workspaces, user?.preferences?.homeWorkspaceOrder],
  );

  const boardsByWorkspaceMap = useMemo(
    () => buildBoardsByWorkspaceSortedMap(allBoards),
    [allBoards],
  );

  const listRootRef = useRef<HTMLDivElement | null>(null);
  const floatHostRef = useRef<HTMLDivElement | null>(null);
  const previewPositionRef = useRef({ x: 0, y: 0 });
  const previewMetricsRef = useRef({ width: 220, height: 120 });
  const [workspaceRowDrag, setWorkspaceRowDrag] = useState<{
    workspaceId: string | null;
    insertIndex: number | null;
  }>({ workspaceId: null, insertIndex: null });
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
    orderedWorkspaceIds: orderedWorkspaces.map((w) => w.id),
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
    canDragBoard: (b) => homePerms.canDragBoardOnHome(b),
    canReorderAllBoardsInWorkspace: (wsId) =>
      user != null &&
      homePerms.canReorderAllBoardsInScope(user.id, boardsByWorkspaceMap.get(wsId.trim()) ?? []),
    hasBoardUpdate: homePerms.hasBoardUpdate,
    hasWorkspaceUpdate: (wid) =>
      user != null && wsPerms.loaded && wsPerms.can(wid, 'workspaces.update'),
    persistWorkspaceOrder,
    onMoveError: (msg) => {
      notifications.show({ title: 'Error', message: msg, color: 'red' });
    },
  };

  const pointerDragRefs: HomePagePointerDragRefs = {
    listRootRef,
    floatHostRef,
    previewPositionRef,
    previewMetricsRef,
  };

  const { suppressBoardClickRef, floatPreview, draggingBoardId } = useHomePagePointerDrag(
    pointerDragRefs,
    modelsRef,
    actionsRef,
    !loading && !authLoading && authenticated,
    isMobile,
  );

  const refreshData = async () => {
    if (!isMountedRef.current) return;

    try {
      const [workspacesResponse, boards] = await Promise.all([
        api.getWorkspaces({
          view: 'summary',
          fields: [...HOME_WORKSPACE_SUMMARY_FIELDS],
        }),
        loadAllHomeBoardSummaries(),
      ]);
      const rawWorkspaces = (workspacesResponse as { workspaces: unknown[] }).workspaces;
      const transformedWorkspaces: WorkspaceDB[] = rawWorkspaces.map((workspace) =>
        transformWorkspace(workspace),
      );

      if (!isMountedRef.current) return;

      setWorkspaces(transformedWorkspaces);
      setAllBoards(boards);

      await db.transaction('rw', db.workspaces, db.boards, async () => {
        await replaceDexieWorkspacesFromHomeApiList(transformedWorkspaces);
        if (boards.length > 0) {
          await db.boards.bulkPut(boards);
        }
      });
      void resyncWorkspaceSocketRoomsFromDexie();
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };


  // Redirect to login if not authenticated (safety check)
  useEffect(() => {
    if (!authLoading && !authenticated) {
      navigate('/login', { replace: true });
    }
  }, [authenticated, authLoading, navigate]);

  useEffect(() => {
    isMountedRef.current = true;

    // Only load data if authenticated
    if (!authenticated || authLoading) {
      return undefined;
    }

    const myGen = ++homeDataLoadGenRef.current;

    const loadData = async () => {
      if (!isMountedRef.current) return;

      try {
        if (isMountedRef.current) {
          setLoading(true);
        }

        const [workspacesResponse, boards] = await Promise.all([
          api.getWorkspaces({
            view: 'summary',
            fields: [...HOME_WORKSPACE_SUMMARY_FIELDS],
          }),
          loadAllHomeBoardSummaries(),
        ]);

        if (!isMountedRef.current || homeDataLoadGenRef.current !== myGen) {
          return;
        }

        const rawWorkspaces = (workspacesResponse as { workspaces: unknown[] }).workspaces;
        const transformedWorkspaces: WorkspaceDB[] = rawWorkspaces.map((workspace) =>
          transformWorkspace(workspace),
        );

        setWorkspaces(transformedWorkspaces);
        setAllBoards(boards);

        await db.transaction('rw', db.workspaces, db.boards, async () => {
          await replaceDexieWorkspacesFromHomeApiList(transformedWorkspaces);
          if (boards.length > 0) {
            await db.boards.bulkPut(boards);
          }
        });
        void resyncWorkspaceSocketRoomsFromDexie();
      } catch (error) {
        console.error('Error loading data:', error);
        // If we get a 401, the API interceptor will handle redirect
      } finally {
        if (isMountedRef.current && homeDataLoadGenRef.current === myGen) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      homeDataLoadGenRef.current += 1;
      isMountedRef.current = false;
    };
  }, [authenticated, authLoading]);

  const handleDeleteWorkspace = (workspaceId: string) => {
    modals.openConfirmModal({
      title: 'Delete workspace?',
      centered: true,
      children: (
        <Text size="sm">
          This will permanently delete the workspace and all its boards. This action cannot be undone.
        </Text>
      ),
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
  };

  if (loading) {
    return (
      <Box className="home-page__loading">
        <Loader size="lg" />
      </Box>
    );
  }

  const orderedWsIds = orderedWorkspaces.map((w) => w.id);
  const workspaceInsertLineBeforeFullIndex =
    workspaceRowDrag.workspaceId != null && workspaceRowDrag.insertIndex != null
      ? fullWorkspaceInsertBeforeIndex(
          orderedWsIds,
          workspaceRowDrag.workspaceId,
          workspaceRowDrag.insertIndex,
        )
      : -1;

  return (
    <>
      <Box
        className={`home-page${homePageDragging ? ' home-page--dragging' : ''}${
          isMobile ? ' home-page--mobile' : responsiveTier === 'tablet' ? ' home-page--tablet' : ''
        }`}
        style={homePageRootStyle}
      >
        <div
          ref={floatHostRef}
          data-home-drag-preview="1"
          className="home-page__drag-float-host"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 5000,
            pointerEvents: 'none',
            visibility: floatPreview != null ? 'visible' : 'hidden',
            transform: 'translate3d(0,0,0)',
          }}
          aria-hidden
        >
          {floatPreview?.kind === 'board' ? (
            <div className="home-page__drag-float-card">
              <span className="home-page__drag-float-card-title">{floatPreview.name}</span>
            </div>
          ) : null}
          {floatPreview?.kind === 'workspace' ? (
            <div className="home-page__drag-float-workspace">
              <span className="home-page__drag-float-workspace-title">{floatPreview.name}</span>
            </div>
          ) : null}
        </div>
        <Box
          p="md"
          className="home-page__nav"
          style={{ backgroundColor: appChrome.homepageNavbarColor }}
        >
          <Box className="home-page__nav-inner">
            <Box className="home-page__nav-brand">
              <Group gap="xs" wrap="nowrap" align="center">
                {homeNavIconUrl !== null ? (
                  <img
                    src={homeNavIconUrl}
                    alt=""
                    width={homeNavIconPx}
                    height={homeNavIconPx}
                    className="home-page__nav-brand-favicon"
                  />
                ) : (
                  <IconLayoutKanbanFilled
                    size={homeNavIconPx}
                    className="home-page__logo-icon"
                    aria-hidden
                  />
                )}
                <span className="home-page__nav-brand-label" style={homeNavLabelStyle}>
                  {homeNavLabel}
                </span>
              </Group>
            </Box>
            <Group gap="md">
              <OfflineIndicator />
              <UserMenu
                showDisplayName
                nameClassName="home-page__user-name"
                nameStyle={homeUserNameStyle}
                {...(isMobile ? { avatarSize: 38 } : {})}
              />
            </Group>
          </Box>
        </Box>

        <Box className="home-page__main" style={homeMainStyle}>
          <Box ref={listRootRef} className="home-page__list-root">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
              <Title order={1} className="home-page__title">Your Workspaces</Title>
              <Group
                gap="xs"
                wrap="nowrap"
                className={`home-page__actions${isMobile ? ' home-page__actions--icon-only' : ''}`}
              >
                {isMobile ? (
                  <>
                    <ActionIcon
                      variant="default"
                      size="lg"
                      radius="md"
                      className="home-page__import-btn home-page__import-btn--icon-only"
                      onClick={() => setShowImportModal(true)}
                      aria-label="Import boards or workspaces"
                    >
                      <IconFileImport size={22} stroke={1.65} />
                    </ActionIcon>
                    <ActionIcon
                      color="blue"
                      variant="filled"
                      size="lg"
                      radius="md"
                      className="home-page__new-workspace-btn home-page__new-workspace-btn--icon-only"
                      onClick={() => setShowCreateWorkspace(true)}
                      aria-label="New workspace"
                    >
                      <IconPlus size={22} stroke={1.75} />
                    </ActionIcon>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="home-page__import-btn"
                      leftSection={
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M8 2V10M8 2L5 5M8 2L11 5M2 10V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V10"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      }
                      onClick={() => setShowImportModal(true)}
                    >
                      Import
                    </Button>
                    <Button
                      color="blue"
                      size="sm"
                      className="home-page__new-workspace-btn"
                      leftSection={<span className="home-page__icon-plus">+</span>}
                      onClick={() => setShowCreateWorkspace(true)}
                    >
                      New Workspace
                    </Button>
                  </>
                )}
              </Group>
            </Group>

            {orderedWorkspaces.map((workspace, fullIndex) => {
              const workspaceBoards = boardsByWorkspaceMap.get(workspace.id) ?? [];
              const boardScopedHomeOnly = workspace.boardScopedHomeOnly === true;
              const wsManage =
                user != null &&
                wsPerms.loaded &&
                (wsPerms.can(workspace.id, 'workspaces.update') ||
                  wsPerms.can(workspace.id, 'workspaces.delete'));
              const wsUpdate =
                user != null &&
                (workspace.ownerId === user.id ||
                  (wsPerms.loaded && wsPerms.can(workspace.id, 'workspaces.update')));
              const wsDeletePerm = user != null && wsPerms.loaded && wsPerms.can(workspace.id, 'workspaces.delete');
              const canCreateBoardInWs =
                user != null &&
                (workspace.ownerId === user.id ||
                  (wsPerms.loaded && wsPerms.can(workspace.id, 'boards.create')));
              return (
                <Fragment key={workspace.id}>
                {workspaceInsertLineBeforeFullIndex === fullIndex ? (
                  <Box className="home-page__workspace-insert-line" />
                ) : null}
                <Group
                  align="flex-start"
                  wrap="nowrap"
                  gap="lg"
                  className="home-page__workspace-row"
                  data-home-workspace-row="1"
                  data-home-workspace-id={workspace.id}
                >
                  <Box className="home-page__workspace-content">
                    <Stack gap="xs">
                      <Group gap="xs" wrap="nowrap" align="center">
                        {wsUpdate ? (
                          <Box
                            component="span"
                            data-home-workspace-drag-handle="1"
                            data-home-workspace-id={workspace.id}
                            className="home-page__workspace-drag-handle"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <IconGripVertical size={18} aria-hidden />
                          </Box>
                        ) : null}
                        <Title order={2} size="h3" fw={700} className="home-page__workspace-title">
                          {workspace.name}
                        </Title>
                        {!boardScopedHomeOnly && canCreateBoardInWs ? (
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            className="home-page__workspace-add-board-icon"
                            aria-label="Add board"
                            onClick={() => {
                              setSelectedWorkspaceIdForBoard(workspace.id);
                              setShowCreateBoard(true);
                            }}
                          >
                            <IconPlus size={16} stroke={2} />
                          </ActionIcon>
                        ) : null}
                        {!boardScopedHomeOnly && wsManage ? (
                          <Menu position="bottom-end" shadow="md" width={200}>
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Workspace options">
                                <span className="home-page__ellipsis-icon">⋯</span>
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {wsUpdate ? (
                                <Menu.Item
                                  onClick={() => {
                                    setRenameWorkspaceTarget({
                                      id: workspace.id,
                                      initialName: workspace.name ?? '',
                                    });
                                  }}
                                >
                                  Rename workspace
                                </Menu.Item>
                              ) : null}
                              {wsUpdate ? (
                                <Menu.Item
                                  onClick={() => {
                                    setEditDescriptionTarget({
                                      id: workspace.id,
                                      initialDescription: workspace.description ?? '',
                                    });
                                  }}
                                >
                                  Edit description
                                </Menu.Item>
                              ) : null}
                              {wsUpdate ? (
                                <Menu.Item onClick={() => setWorkspaceSettingsId(workspace.id)}>
                                  Workspace Settings
                                </Menu.Item>
                              ) : null}
                              {wsUpdate && wsDeletePerm ? <Menu.Divider /> : null}
                              {wsDeletePerm ? (
                                <Menu.Item color="red" onClick={() => handleDeleteWorkspace(workspace.id)}>
                                  Delete workspace
                                </Menu.Item>
                              ) : null}
                            </Menu.Dropdown>
                          </Menu>
                        ) : null}
                      </Group>
                      {workspace.description ? (
                        <Text size="xs" fw={400} c="dimmed" className="home-page__workspace-description">
                          {workspace.description}
                        </Text>
                      ) : null}
                      <div
                        className={`home-page__board-grid${
                          boardGridDropTargetWsId === workspace.id
                            ? ' home-page__board-grid--cross-workspace-drop-target'
                            : ''
                        }`}
                        data-home-board-grid="1"
                        data-home-workspace-id={workspace.id}
                        role="region"
                        aria-label={`Workspace ${workspace.name ?? 'Workspace'} boards`}
                      >
                        {workspaceBoards.length > 0 ? (
                          workspaceBoards.map((board) => (
                            <HomeBoardCardTile
                              key={board.id}
                              board={board}
                              workspaceId={workspace.id}
                              showBoardCardMenu={
                                homePerms.loaded && homePerms.can(board.id, 'boards.update')
                              }
                              boardDraggable={homePerms.loaded && homePerms.canDragBoardOnHome(board)}
                              isDraggingSource={draggingBoardId === board.id}
                              suppressNavigateRef={suppressBoardClickRef}
                              hoveredBoardId={hoveredBoardId}
                              onHover={setHoveredBoardId}
                              onOpenBoard={(id) => navigate(`/boards/${id}`)}
                              onRefresh={refreshData}
                            />
                          ))
                        ) : (
                          <Text ta="center" c="dimmed" py="md" size="sm">
                            {boardScopedHomeOnly
                              ? 'No boards shared with you in this workspace yet.'
                              : canCreateBoardInWs
                                ? 'No boards in this workspace. Click + beside the title to add one.'
                                : 'No boards in this workspace yet.'}
                          </Text>
                        )}
                      </div>
                    </Stack>
                  </Box>
                </Group>
                </Fragment>
              );
            })}

            {workspaceInsertLineBeforeFullIndex === orderedWorkspaces.length ? (
              <Box className="home-page__workspace-insert-line" />
            ) : null}

            {orderedWorkspaces.length === 0 && (
              <Box ta="center" py="xl">
                <Text c="dimmed" mb="md">No workspaces yet.</Text>
                <Text c="dimmed" size="sm">Create a private workspace to hold your boards, then add boards there.</Text>
              </Box>
            )}
          </Stack>
          </Box>
        </Box>

        {showCreateWorkspace && (
          <CreateWorkspaceModal
            onClose={() => setShowCreateWorkspace(false)}
            onSuccess={refreshData}
          />
        )}

        {showCreateBoard && selectedWorkspaceIdForBoard != null && (
          <CreateBoardModal
            workspaceId={selectedWorkspaceIdForBoard}
            onClose={() => {
              setShowCreateBoard(false);
              setSelectedWorkspaceIdForBoard(null);
            }}
            onSuccess={refreshData}
          />
        )}

        {showImportModal && (
          <ImportExportModal
            onClose={() => setShowImportModal(false)}
            onImportComplete={refreshData}
          />
        )}

        {workspaceSettingsId !== null && (
          <WorkspaceSettingsModal
            workspaceId={workspaceSettingsId}
            onClose={() => setWorkspaceSettingsId(null)}
          />
        )}

        <RenameWorkspaceModal
          key={renameWorkspaceTarget?.id ?? 'rename-closed'}
          target={renameWorkspaceTarget}
          onClose={() => setRenameWorkspaceTarget(null)}
          onSuccess={refreshData}
        />

        <EditWorkspaceDescriptionModal
          key={editDescriptionTarget?.id ?? 'description-closed'}
          target={editDescriptionTarget}
          onClose={() => setEditDescriptionTarget(null)}
          onSuccess={refreshData}
        />
      </Box>
    </>
  );
}
