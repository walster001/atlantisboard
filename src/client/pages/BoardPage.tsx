import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, Box, Text, Title, Group, ActionIcon } from '@mantine/core';
import { IconArrowLeft, IconLayoutKanbanFilled, IconLink, IconSettings } from '@tabler/icons-react';
import { useSync } from '../hooks/useSync.js';
import { useSocket } from '../hooks/useSocket.js';
import { UserMenu } from '../components/UserMenu.js';
import { db, type BoardDB, type BoardSettingsLivePatch, type ListDB } from '../store/database.js';
import {
  subscribeSocketBoardUpdated,
  subscribeSocketListCreated,
  subscribeSocketListDeleted,
  subscribeSocketListUpdated,
} from '../utils/socketRealtimeBridge.js';
const KanbanView = lazy(async () => {
  const m = await import('../components/board/KanbanView.js');
  return { default: m.KanbanView };
});
import { BoardCardDetailOverlay } from '../components/card/BoardCardDetailOverlay.js';
import type { CardDB } from '../store/database.js';
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
  const [board, setBoard] = useState<BoardDB | null>(null);
  const [lists, setLists] = useState<ListDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [cardsRefreshKey, setCardsRefreshKey] = useState(0);
  const [cardHydrateEpoch, setCardHydrateEpoch] = useState(0);
  const boardCardPatchRef = useRef<((card: CardDB) => void) | null>(null);
  const { syncBoardData } = useSync();
  const { appBranding, branding: loginBranding } = useAppBranding();
  const boardHomeIconUrl = resolveBoardNavbarIconUrl(appBranding, loginBranding);
  const boardNavIconPx = appBranding.boardNavbarIconSizePx;
  const isMountedRef = useRef(true);
  useSocket(boardId);
  const { can, loaded: permissionsLoaded, permissions } = useBoardPermissions(
    boardId,
    board?.workspaceId,
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

  const loadData = useCallback(async () => {
    if (!boardId || !isMountedRef.current) return;

    try {
      if (isMountedRef.current) {
        setLoading(true);
      }
      await syncBoardData(boardId);

      if (!isMountedRef.current) return;

      const boardData = await db.boards.get(boardId);
      const boardLists = await db.lists.where('boardId').equals(boardId).sortBy('position');

      if (isMountedRef.current) {
        setBoard(boardData || null);
        setLists(boardLists);
        setCardHydrateEpoch((e) => e + 1);
      }
    } catch {
      /* load failed */
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [boardId, syncBoardData]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!boardId) {
      return undefined;
    }
    void loadData();
    return () => {
      isMountedRef.current = false;
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

  useEffect(() => {
    if (!boardId) {
      return undefined;
    }

    const mergeListIntoState = (list: ListDB): void => {
      setLists((prev) => {
        const i = prev.findIndex((l) => l.id === list.id);
        const next = i < 0 ? [...prev, list] : prev.map((l, idx) => (idx === i ? list : l));
        return [...next].sort((a, b) => a.position - b.position);
      });
    };

    const unsubBoard = subscribeSocketBoardUpdated(({ boardId: bid, board }) => {
      if (!isMountedRef.current || bid !== boardId) {
        return;
      }
      setBoard(board);
    });

    const unsubListCreated = subscribeSocketListCreated(({ boardId: bid, list }) => {
      if (!isMountedRef.current || bid !== boardId) {
        return;
      }
      mergeListIntoState(list);
    });

    const unsubListUpdated = subscribeSocketListUpdated(({ boardId: bid, list }) => {
      if (!isMountedRef.current || bid !== boardId) {
        return;
      }
      mergeListIntoState(list);
    });

    const unsubListDeleted = subscribeSocketListDeleted(({ boardId: bid, listId }) => {
      if (!isMountedRef.current || bid !== boardId) {
        return;
      }
      setLists((prev) => prev.filter((l) => l.id !== listId));
    });

    return () => {
      unsubBoard();
      unsubListCreated();
      unsubListUpdated();
      unsubListDeleted();
    };
  }, [boardId]);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleOpenCard = useCallback(
    (card: CardDB) => {
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
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('card');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

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
            board={board}
            lists={lists}
            cardsRefreshKey={cardsRefreshKey}
            cardHydrateEpoch={cardHydrateEpoch}
            boardCardPatchRef={boardCardPatchRef}
            kanbanCaps={kanbanCaps}
            onListsReordered={(next) => {
              setLists(next);
            }}
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
            setBoard((prev) => {
              if (prev == null) {
                return prev;
              }
              const nextSettings: BoardDB['settings'] = { ...prev.settings };
              const { memberActivityLogRetentionDays: retentionPatch, ...restPatch } = patch;
              Object.assign(nextSettings, restPatch);
              if (Object.prototype.hasOwnProperty.call(patch, 'memberActivityLogRetentionDays')) {
                if (retentionPatch === null || retentionPatch === undefined) {
                  delete nextSettings.memberActivityLogRetentionDays;
                } else {
                  nextSettings.memberActivityLogRetentionDays = retentionPatch;
                }
              }
              return { ...prev, settings: nextSettings };
            });
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
          boardSettings={board.settings}
          onClose={handleCloseCardOverlay}
          onCardDuplicated={loadData}
          onCardDeleted={() => setCardsRefreshKey((k) => k + 1)}
          onCardUpdated={(c) => {
            boardCardPatchRef.current?.(c);
          }}
        />
      ) : null}
    </Box>
  );
}
