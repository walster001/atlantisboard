import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { Loader, Box, Text, Title, Group, ActionIcon } from '@mantine/core';
import { IconArrowLeft, IconLayoutKanbanFilled, IconLink, IconSettings } from '@tabler/icons-react';
import { useSocket } from '../hooks/useSocket.js';
import { UserMenu } from '../components/UserMenu.js';
import type { BoardSettingsLivePatch, CardDB } from '../store/database.js';
import type { BoardThemeSettings } from '../../shared/boardTheme.js';
import { useBoardRuntimeStore } from '../store/boardRuntimeStore.js';
import { bootstrapBoardRuntimeFromApi, resyncBoardRuntimeFromApi } from '../store/boardBootstrap.js';
const KanbanView = lazy(async () => {
  const m = await import('../components/board/KanbanView.js');
  return { default: m.KanbanView };
});
import {
  BoardCardDetailOverlay,
  primeCardDetailWindow,
} from '../components/card/BoardCardDetailOverlay.js';
import { BoardSettingsModal } from '../components/board/BoardSettingsModal.js';
import { BoardInvitesModal } from '../components/board/BoardInvitesModal.js';
import { OfflineIndicator } from '../components/OfflineIndicator.js';
import { useAppBranding } from '../contexts/AppBrandingContext.js';
import { resolveBoardNavbarIconUrl } from '../../shared/types/appBranding.js';
import { buildKanbanBoardEditCaps } from '../hooks/kanbanBoardEditCaps.js';
import { useBoardPermissions } from '../hooks/useBoardPermissions.js';
import { getBoardPageThemeStyle } from '../utils/boardThemeStyle.js';
import { resolveBoardSettingsGate } from '../utils/boardSettingsPermissions.js';
import type { ScaleMode } from '../components/board/scaleModePolicy.js';
import { env } from '../config/env.js';
import { useResponsiveTier } from '../hooks/useResponsiveTier.js';
import '../components/board/boardView.css';

const KANBAN_VIEW_SUSPENSE_FALLBACK = (
  <Box className="flex items-center justify-center" style={{ minHeight: 280 }}>
    <Loader size="md" />
  </Box>
);

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const isTablet = responsiveTier === 'tablet';
  const [searchParams, setSearchParams] = useSearchParams();
  const forcedScaleMode = (
    searchParams.get('scaleMode')?.trim() ??
    env.BOARD_SCALE_FIXTURE_MODE.trim()
  ) as ScaleMode | '';
  const overlayCardId = searchParams.get('card')?.trim() || null;
  const board = useBoardRuntimeStore((s) => s.board);
  const workspaceIdForPermissions = board?.workspaceId;
  const latestBoardIdRef = useRef(boardId);
  latestBoardIdRef.current = boardId;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [overlayInitialCard, setOverlayInitialCard] = useState<CardDB | null>(null);
  const boardCardPatchRef = useRef<((card: CardDB) => void) | null>(null);
  const { appBranding, branding: loginBranding } = useAppBranding();
  const boardHomeIconUrl = resolveBoardNavbarIconUrl(appBranding, loginBranding);
  const boardNavIconPx = appBranding.boardNavbarIconSizePx;
  const isMountedRef = useRef(true);
  const swipeRef = useRef<{ active: boolean; startX: number; startY: number; fromTop: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    fromTop: false,
  });
  useSocket(boardId);
  const { can, loaded: permissionsLoaded, permissions } = useBoardPermissions(
    boardId,
    workspaceIdForPermissions,
  );
  const kanbanCaps = useMemo(
    () => buildKanbanBoardEditCaps(permissionsLoaded, permissions),
    [permissionsLoaded, permissions],
  );
  const boardSettingsGate = useMemo(() => resolveBoardSettingsGate(can), [can]);
  const {
    canManageBoardSettings,
    canManageBoardMembers,
    canChangeTheme,
    canManageCustomThemes,
    canOpenSettings,
  } = boardSettingsGate;
  const allowedSettingsTabs = useMemo(() => {
    if (!canManageBoardSettings && canManageBoardMembers) {
      return ['users'] as const;
    }
    const tabs: Array<'board' | 'users' | 'theme' | 'audit'> = ['board', 'users', 'audit'];
    if (canChangeTheme) {
      tabs.splice(2, 0, 'theme');
    }
    return tabs;
  }, [canManageBoardSettings, canManageBoardMembers, canChangeTheme]);

  const loadData = useCallback(
    async (options?: { mode?: 'initial' | 'quiet'; signal?: AbortSignal }) => {
      if (!boardId || !isMountedRef.current) return;

      const mode = options?.mode ?? 'quiet';
      const isInitial = mode === 'initial';
      const requestedBoardId = boardId;
      const signal = options?.signal;

      try {
        const ok = await bootstrapBoardRuntimeFromApi(
          requestedBoardId,
          signal != null
            ? {
                signal,
                staged: isInitial,
                ...(forcedScaleMode === 'large'
                  ? { listLimit: 400, hydrateDescriptions: 'viewport' as const }
                  : forcedScaleMode === 'extreme'
                    ? { listLimit: 240, hydrateDescriptions: 'viewport' as const }
                    : {}),
              }
            : {
                staged: isInitial,
                ...(forcedScaleMode === 'large'
                  ? { listLimit: 400, hydrateDescriptions: 'viewport' as const }
                  : forcedScaleMode === 'extreme'
                    ? { listLimit: 240, hydrateDescriptions: 'viewport' as const }
                    : {}),
              },
        );

        if (!isMountedRef.current) return;
        if (latestBoardIdRef.current !== requestedBoardId) return;
        if (signal?.aborted === true) return;

        if (isInitial) {
          await import('../components/board/KanbanView.js');
        }

        if (isMountedRef.current && latestBoardIdRef.current === requestedBoardId) {
          if (!ok) {
            setLoadFailed(true);
            useBoardRuntimeStore.getState().clear();
          } else {
            setLoadFailed(false);
          }
        }
      } catch {
        if (signal?.aborted === true) {
          return;
        }
        if (
          isMountedRef.current &&
          latestBoardIdRef.current === requestedBoardId
        ) {
          setLoadFailed(true);
          useBoardRuntimeStore.getState().clear();
        }
      } finally {
        if (
          isInitial &&
          isMountedRef.current &&
          latestBoardIdRef.current === requestedBoardId &&
          signal?.aborted !== true
        ) {
          setLoading(false);
        }
      }
    },
    [boardId, forcedScaleMode],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!boardId) {
      return undefined;
    }
    const ac = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    useBoardRuntimeStore.getState().clear();
    void loadData({ mode: 'initial', signal: ac.signal });
    return () => {
      ac.abort();
      isMountedRef.current = false;
      useBoardRuntimeStore.getState().clear();
    };
  }, [boardId, loadData]);

  useLayoutEffect(() => {
    const body = document.querySelector('.board-page__body');
    if (!(body instanceof HTMLElement) || !isMobile) {
      return;
    }
    const touchState = {
      active: false,
      edgeGesture: false,
      startX: 0,
      startY: 0,
      lastX: 0,
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') {
        return;
      }
      swipeRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        fromTop: event.clientY <= 28,
      };
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!swipeRef.current.active || !swipeRef.current.fromTop || event.pointerType !== 'touch') {
        return;
      }
      const dy = event.clientY - swipeRef.current.startY;
      const dx = Math.abs(event.clientX - swipeRef.current.startX);
      if (dy > 92 && dx < 48) {
        swipeRef.current.active = false;
        navigate('/');
      }
    };
    const onPointerEnd = (): void => {
      swipeRef.current.active = false;
    };
    const onTouchStart = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (touch == null) {
        return;
      }
      const edgeThreshold = 28;
      const vw = window.innerWidth;
      touchState.active = true;
      touchState.startX = touch.clientX;
      touchState.startY = touch.clientY;
      touchState.lastX = touch.clientX;
      touchState.edgeGesture = touch.clientX <= edgeThreshold || touch.clientX >= vw - edgeThreshold;
    };
    const onTouchMove = (event: TouchEvent): void => {
      if (!touchState.active || !touchState.edgeGesture) {
        return;
      }
      const touch = event.touches[0];
      if (touch == null) {
        return;
      }
      const dx = touch.clientX - touchState.startX;
      const dy = touch.clientY - touchState.startY;
      if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 6) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      const delta = touch.clientX - touchState.lastX;
      body.scrollLeft -= delta;
      touchState.lastX = touch.clientX;
    };
    const onTouchEnd = (): void => {
      touchState.active = false;
      touchState.edgeGesture = false;
    };
    body.addEventListener('pointerdown', onPointerDown, { passive: true });
    body.addEventListener('pointermove', onPointerMove, { passive: true });
    body.addEventListener('pointerup', onPointerEnd, { passive: true });
    body.addEventListener('pointercancel', onPointerEnd, { passive: true });
    body.addEventListener('touchstart', onTouchStart, { passive: true });
    body.addEventListener('touchmove', onTouchMove, { passive: false });
    body.addEventListener('touchend', onTouchEnd, { passive: true });
    body.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      body.removeEventListener('pointerdown', onPointerDown);
      body.removeEventListener('pointermove', onPointerMove);
      body.removeEventListener('pointerup', onPointerEnd);
      body.removeEventListener('pointercancel', onPointerEnd);
      body.removeEventListener('touchstart', onTouchStart);
      body.removeEventListener('touchmove', onTouchMove);
      body.removeEventListener('touchend', onTouchEnd);
      body.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isMobile, navigate]);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleOpenInvites = useCallback(() => {
    setShowInvites(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    if (!canOpenSettings) {
      setShowSettings(false);
      return;
    }
    setShowSettings(true);
  }, [canOpenSettings]);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleCloseInvites = useCallback(() => {
    setShowInvites(false);
  }, []);

  const handleSettingsLivePatch = useCallback((patch: BoardSettingsLivePatch) => {
    useBoardRuntimeStore.getState().applyBoardSettingsLivePatch(patch);
  }, []);

  const handleThemeLivePatch = useCallback((patch: { themeSettings: BoardThemeSettings; background?: string }) => {
    const store = useBoardRuntimeStore.getState();
    const current = store.board;
    if (current == null) {
      return;
    }
    store.commitBoard({
      ...current,
      themeSettings: patch.themeSettings,
      ...(patch.background !== undefined ? { background: patch.background } : {}),
    });
  }, []);

  const handleOpenCard = useCallback(
    (card: CardDB) => {
      primeCardDetailWindow(card.id, card);
      setOverlayInitialCard(card);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('card', card.id);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const handleCloseCardOverlay = useCallback(() => {
    setOverlayInitialCard(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('card');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleCardOverlayDuplicated = useCallback(() => {
    const id = board?.id;
    if (id != null) {
      void resyncBoardRuntimeFromApi(id);
    }
  }, [board?.id]);

  const handleCardOverlayDeleted = useCallback(() => {
    if (overlayCardId) {
      useBoardRuntimeStore.getState().removeCard(overlayCardId);
    }
  }, [overlayCardId]);

  const handleCardOverlayUpdated = useCallback((c: CardDB) => {
    boardCardPatchRef.current?.(c);
  }, []);

  const overlayInitialCardForId =
    overlayCardId != null && overlayInitialCard?.id === overlayCardId ? overlayInitialCard : undefined;
  const boardThemeStyle = useMemo(
    () => (board != null ? getBoardPageThemeStyle(board) : undefined),
    [board?.themeSettings, board?.background],
  );
  if (loading) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Loader size="lg" />
      </Box>
    );
  }

  if (boardId && permissionsLoaded && !can('boards.view')) {
    return <Navigate to="/" replace />;
  }

  if (!board && !loadFailed) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Loader size="lg" />
      </Box>
    );
  }

  if (!board) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Box ta="center">
          <Title order={1} mb="md">Board not found</Title>
          <Text c="dimmed">The board you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      className={`board-page${isMobile ? ' board-page--mobile' : isTablet ? ' board-page--tablet' : ''}`}
      {...(boardThemeStyle !== undefined ? { style: boardThemeStyle } : {})}
    >
      <Box className="board-page__header">
        <Group justify="space-between" align="center" wrap="nowrap" gap="md">
          <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
            <ActionIcon
              variant="transparent"
              size="lg"
              radius="md"
              className="board-page__header-icon"
              onClick={handleBack}
              aria-label="Back to boards"
            >
              <IconArrowLeft size={22} stroke={1.75} />
            </ActionIcon>
            <Box
              component="span"
              className="board-page__header-brand-mark"
              aria-hidden
            >
              {boardHomeIconUrl !== null ? (
                <img
                  src={boardHomeIconUrl}
                  alt=""
                  width={boardNavIconPx}
                  height={boardNavIconPx}
                  style={{ objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <IconLayoutKanbanFilled size={boardNavIconPx} aria-hidden />
              )}
            </Box>
            <Text component="span" className="board-page__title">
              {board.name}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap" align="center">
            <OfflineIndicator />
            {permissionsLoaded && can('invites.view') ? (
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="md"
                className="board-page__header-icon"
                onClick={handleOpenInvites}
                aria-label="Board invites"
              >
                <span className="board-page__header-icon-link-horizontal" aria-hidden>
                  <IconLink size={19} stroke={1.5} />
                </span>
              </ActionIcon>
            ) : null}
            {canOpenSettings ? (
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="md"
                className="board-page__header-icon"
                onClick={handleOpenSettings}
                aria-label="Board settings"
              >
                <IconSettings size={20} stroke={1.9} />
              </ActionIcon>
            ) : null}
            <UserMenu
              showDisplayName
              nameClassName="board-page__user-name"
              {...(isMobile ? {} : { nameVisibleFrom: 'xs' })}
              {...(isMobile ? { avatarSize: 38 } : {})}
              triggerVariant="board"
              triggerMl={4}
            />
          </Group>
        </Group>
      </Box>

      <Box className="board-page__body">
        <Suspense fallback={KANBAN_VIEW_SUSPENSE_FALLBACK}>
          <KanbanView
            board={board}
            boardCardPatchRef={boardCardPatchRef}
            kanbanCaps={kanbanCaps}
            onOpenCard={handleOpenCard}
          />
        </Suspense>
      </Box>

      {showSettings && canOpenSettings ? (
        <BoardSettingsModal
          key={`settings:${board.id}:${permissionsLoaded ? 'ready' : 'loading'}`}
          boardId={board.id}
          onClose={handleCloseSettings}
          allowedTopTabs={allowedSettingsTabs}
          canManageCustomThemes={canManageCustomThemes}
          onSettingsLivePatch={handleSettingsLivePatch}
          onThemeLivePatch={handleThemeLivePatch}
        />
      ) : null}

      {showInvites ? (
        <BoardInvitesModal
          key={`invites:${board.id}`}
          boardId={board.id}
          onClose={handleCloseInvites}
        />
      ) : null}

      {overlayCardId ? (
        <BoardCardDetailOverlay
          key={`overlay:${board.id}:${overlayCardId}`}
          boardId={board.id}
          boardWorkspaceId={board.workspaceId ?? null}
          cardId={overlayCardId}
          {...(overlayInitialCardForId !== undefined ? { initialCard: overlayInitialCardForId } : {})}
          boardSettings={board.settings}
          onClose={handleCloseCardOverlay}
          onCardDuplicated={handleCardOverlayDuplicated}
          onCardDeleted={handleCardOverlayDeleted}
          onCardUpdated={handleCardOverlayUpdated}
        />
      ) : null}
    </Box>
  );
}
