import { Suspense, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { Loader, Box, Text, Title, Group, ActionIcon } from '@mantine/core';
import { IconArrowLeft, IconLayoutKanbanFilled, IconLink, IconSettings } from '@tabler/icons-react';
import { UserMenu } from '../components/UserMenu.js';
import { BoardCardDetailOverlay } from '../components/card/BoardCardDetailOverlay.js';
import { BoardSettingsModal } from '../components/board/BoardSettingsModal.js';
import { BoardInvitesModal } from '../components/board/BoardInvitesModal.js';
import { OfflineIndicator } from '../components/OfflineIndicator.js';
import { useAppBranding } from '../contexts/AppBrandingContext.js';
import { resolveBoardNavbarIconUrl } from '../../shared/types/appBranding.js';
import type { ScaleMode } from '../components/board/scaleModePolicy.js';
import { env } from '../config/env.js';
import { useResponsiveTier } from '../hooks/useResponsiveTier.js';
import { useIsPwa } from '../hooks/usePwaDisplayMode.js';
import { KanbanView, KANBAN_VIEW_SUSPENSE_FALLBACK } from './BoardPage/kanbanViewLoader.js';
import { useBoardBodyMobileGestures } from './BoardPage/useBoardBodyMobileGestures.js';
import { useBoardPageController } from './BoardPage/useBoardPageController.js';
import '../components/board/boardView.css';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const isTablet = responsiveTier === 'tablet';
  const isPwa = useIsPwa();
  const [searchParams, setSearchParams] = useSearchParams();
  const forcedScaleMode = (
    searchParams.get('scaleMode')?.trim() ??
    env.BOARD_SCALE_FIXTURE_MODE.trim()
  ) as ScaleMode | '';
  const overlayCardId = searchParams.get('card')?.trim() || null;
  const { appBranding, branding: loginBranding } = useAppBranding();
  const boardHomeIconUrl = resolveBoardNavbarIconUrl(appBranding, loginBranding);
  const boardNavIconPx = appBranding.boardNavbarIconSizePx;
  const {
    board,
    loading,
    loadFailed,
    showSettings,
    showInvites,
    permissionsLoaded,
    can,
    canOpenSettings,
    canManageCustomThemes,
    allowedSettingsTabs,
    kanbanCaps,
    boardThemeStyle,
    overlayInitialCardForId,
    boardCardPatchRef,
    handleOpenInvites,
    handleOpenSettings,
    handleCloseSettings,
    handleCloseInvites,
    handleSettingsLivePatch,
    handleThemeLivePatch,
    handleOpenCard,
    handleCloseCardOverlay,
    handleCardOverlayDuplicated,
    handleCardOverlayDeleted,
    handleCardOverlayUpdated,
  } = useBoardPageController({ boardId, forcedScaleMode, overlayCardId, setSearchParams });

  useBoardBodyMobileGestures(isMobile, () => navigate('/'));

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const boardRootClassName = `board-page${isMobile ? ' board-page--mobile' : isTablet ? ' board-page--tablet' : ''}${
    isPwa ? ' board-page--pwa' : ''
  }`;
  const boardRootProps = {
    className: boardRootClassName,
    ...(boardThemeStyle !== undefined ? { style: boardThemeStyle } : {}),
  };

  if (loading) {
    return (
      <Box {...boardRootProps}>
        <Box className="min-h-screen flex items-center justify-center">
          <Loader size="lg" />
        </Box>
      </Box>
    );
  }

  if (boardId && permissionsLoaded && !can('boards.view')) {
    return <Navigate to="/" replace />;
  }

  if (!board && !loadFailed) {
    return (
      <Box {...boardRootProps}>
        <Box className="min-h-screen flex items-center justify-center">
          <Loader size="lg" />
        </Box>
      </Box>
    );
  }

  if (!board) {
    return (
      <Box {...boardRootProps}>
        <Box className="min-h-screen flex items-center justify-center">
          <Box ta="center">
            <Title order={1} mb="md">
              Board not found
            </Title>
            <Text c="dimmed">
              The board you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box {...boardRootProps}>
      <Box className="board-page__header">
        <Box className="board-page__header-inner">
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
                showDisplayName={!isMobile}
                nameClassName="board-page__user-name"
                {...(isMobile ? {} : { nameVisibleFrom: 'xs' })}
                {...(isMobile ? { avatarSize: 38 } : {})}
                triggerVariant="board"
                triggerMl={4}
              />
            </Group>
        </Group>
        </Box>
      </Box>

      <Box className="board-page__body">
        <Suspense fallback={KANBAN_VIEW_SUSPENSE_FALLBACK}>
          <KanbanView
            board={board}
            boardCardPatchRef={boardCardPatchRef}
            kanbanCaps={kanbanCaps}
            onOpenCard={handleOpenCard}
            responsiveTier={responsiveTier}
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
