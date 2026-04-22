import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, Box, Text, Title, Group, ActionIcon } from '@mantine/core';
import { IconArrowLeft, IconLayoutKanbanFilled, IconLink, IconSettings } from '@tabler/icons-react';
import { useSocket } from '../hooks/useSocket.js';
import { UserMenu } from '../components/UserMenu.js';
import type { BoardSettingsLivePatch, CardDB } from '../store/database.js';
import { useBoardRuntimeStore } from '../store/boardRuntimeStore.js';
import { bootstrapBoardRuntimeFromApi, resyncBoardRuntimeFromApi } from '../store/boardBootstrap.js';
const KanbanView = lazy(async () => {
  const m = await import('../components/board/KanbanView.js');
  return { default: m.KanbanView };
});
import {
  BoardCardDetailOverlay,
  preloadCardDetailView,
} from '../components/card/BoardCardDetailOverlay.js';
import { BoardSettingsModal } from '../components/board/BoardSettingsModal.js';
import { BoardInvitesModal } from '../components/board/BoardInvitesModal.js';
import { OfflineIndicator } from '../components/OfflineIndicator.js';
import { useAppBranding } from '../contexts/AppBrandingContext.js';
import { resolveBoardNavbarIconUrl } from '../../shared/types/appBranding.js';
import { useBoardPermissions, type BoardPermissionKey } from '../hooks/useBoardPermissions.js';
import '../components/board/boardView.css';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const overlayCardId = searchParams.get('card')?.trim() || null;
  const board = useBoardRuntimeStore((s) => s.board);
  const workspaceIdForPermissions = useBoardRuntimeStore((s) => s.board?.workspaceId);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [overlayInitialCard, setOverlayInitialCard] = useState<CardDB | null>(null);
  const boardCardPatchRef = useRef<((card: CardDB) => void) | null>(null);
  const { appBranding, branding: loginBranding } = useAppBranding();
  const boardHomeIconUrl = resolveBoardNavbarIconUrl(appBranding, loginBranding);
  const boardNavIconPx = appBranding.boardNavbarIconSizePx;
  const isMountedRef = useRef(true);
  useSocket(boardId);
  const { can, loaded: permissionsLoaded, permissions } = useBoardPermissions(
    boardId,
    workspaceIdForPermissions,
  );
  const kanbanCaps = useMemo(() => {
    const set = new Set(permissions);
    const c = (k: BoardPermissionKey) => set.has(k);
    return {
      canAddList: permissionsLoaded && c('lists.create'),
      canListMenu: permissionsLoaded && (c('lists.update') || c('lists.delete')),
      canAddCard: permissionsLoaded && c('cards.create'),
      canCardKanbanMenu: permissionsLoaded && (c('cards.update') || c('cards.delete')),
      canDragKanbanCards:
        permissionsLoaded && (c('cards.move') || c('cards.reorder')),
      canReorderLists: permissionsLoaded && c('lists.reorder'),
    };
  }, [permissionsLoaded, permissions]);
  const canOpenSettings = can('boards.members.view') || can('boards.update') || can('boards.settings.update');

  const loadData = useCallback(
    async (options?: { mode?: 'initial' | 'quiet' }) => {
      if (!boardId || !isMountedRef.current) return;

      const mode = options?.mode ?? 'quiet';
      const isInitial = mode === 'initial';

      try {
        const ok = await bootstrapBoardRuntimeFromApi(boardId);

        if (!isMountedRef.current) return;

        if (isInitial) {
          await import('../components/board/KanbanView.js');
        }

        if (!ok && isMountedRef.current) {
          useBoardRuntimeStore.getState().clear();
        }
      } catch {
        if (isMountedRef.current) {
          useBoardRuntimeStore.getState().clear();
        }
      } finally {
        if (isInitial && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [boardId],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!boardId) {
      return undefined;
    }
    flushSync(() => {
      setLoading(true);
      useBoardRuntimeStore.getState().clear();
    });
    void loadData({ mode: 'initial' });
    return () => {
      isMountedRef.current = false;
      useBoardRuntimeStore.getState().clear();
    };
  }, [boardId, loadData]);

  useEffect(() => {
    if (!boardId || !permissionsLoaded) {
      return;
    }
    if (!can('boards.view')) {
      navigate('/', { replace: true });
    }
  }, [boardId, permissionsLoaded, can, navigate]);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleOpenCard = useCallback(
    (card: CardDB) => {
      preloadCardDetailView();
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

  const overlayInitialCardForId =
    overlayCardId != null && overlayInitialCard?.id === overlayCardId ? overlayInitialCard : undefined;

  if (loading) {
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
    <Box className="board-page">
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
                onClick={() => setShowInvites(true)}
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
                onClick={() => setShowSettings(true)}
                aria-label="Board settings"
              >
                <IconSettings size={20} stroke={1.9} />
              </ActionIcon>
            ) : null}
            <UserMenu
              showDisplayName
              nameClassName="board-page__user-name"
              nameVisibleFrom="xs"
              triggerVariant="board"
              triggerMl={4}
            />
          </Group>
        </Group>
      </Box>

      <Box className="board-page__body">
        <Suspense
          fallback={
            <Box className="flex items-center justify-center" style={{ minHeight: 280 }}>
              <Loader size="md" />
            </Box>
          }
        >
          <KanbanView
            boardCardPatchRef={boardCardPatchRef}
            kanbanCaps={kanbanCaps}
            onOpenCard={handleOpenCard}
          />
        </Suspense>
      </Box>

      {showSettings ? (
        <BoardSettingsModal
          boardId={board.id}
          onClose={() => setShowSettings(false)}
          {...(!(can('boards.update') || can('boards.settings.update')) && can('boards.members.view')
            ? { allowedTopTabs: ['users'] as const }
            : {})}
          onSettingsLivePatch={(patch: BoardSettingsLivePatch) => {
            useBoardRuntimeStore.getState().applyBoardSettingsLivePatch(patch);
          }}
        />
      ) : null}

      {showInvites ? (
        <BoardInvitesModal boardId={board.id} onClose={() => setShowInvites(false)} />
      ) : null}

      {overlayCardId ? (
        <BoardCardDetailOverlay
          boardId={board.id}
          cardId={overlayCardId}
          {...(overlayInitialCardForId !== undefined ? { initialCard: overlayInitialCardForId } : {})}
          boardSettings={board.settings}
          onClose={handleCloseCardOverlay}
          onCardDuplicated={() => void resyncBoardRuntimeFromApi(board.id)}
          onCardDeleted={() => {
            if (overlayCardId) {
              useBoardRuntimeStore.getState().removeCard(overlayCardId);
            }
          }}
          onCardUpdated={(c) => {
            boardCardPatchRef.current?.(c);
          }}
        />
      ) : null}
    </Box>
  );
}
