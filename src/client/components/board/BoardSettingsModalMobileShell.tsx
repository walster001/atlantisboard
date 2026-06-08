import { Suspense } from 'react';
import {
  ActionIcon,
  Box,
  Group,
  Modal,
  Stack,
  Title,
} from '@mantine/core';
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconHeartRateMonitor,
  IconHistory,
  IconPalette,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import { BoardSettingsListSettingsPanel } from './BoardSettingsListSettingsPanel.js';
import { BoardSettingsCardSettingsPanel } from './BoardSettingsCardSettingsPanel.js';
import { BoardThemeBackgroundTab } from './BoardThemeBackgroundTab.js';
import {
  BoardActivityLog,
  BoardMemberManagement,
  LabelManagement,
  MemberAuditLog,
  TabPanelFallback,
  type MobileDetail,
  type TopTab,
} from './boardSettingsModalShared.js';

interface BoardSettingsModalMobileShellProps {
  boardId: string;
  onClose: () => void;
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
  onThemeLivePatch?: (patch: { themeSettings: BoardThemeSettings; background?: string }) => void;
  canManageCustomThemes: boolean;
  allowed: readonly TopTab[];
  effectiveTopTab: TopTab;
  setTopTab: (tab: TopTab) => void;
  mobileDetail: MobileDetail;
  setMobileDetail: (detail: MobileDetail) => void;
  shellModifier: 'mobile' | 'tablet';
  isTablet: boolean;
  touchLayout: boolean;
  mobileHeaderTitle: string;
  onShellHeaderAction: () => void;
}

export function BoardSettingsModalMobileShell({
  boardId,
  onClose,
  onSettingsLivePatch,
  onThemeLivePatch,
  canManageCustomThemes,
  allowed,
  effectiveTopTab,
  setTopTab,
  mobileDetail,
  setMobileDetail,
  shellModifier,
  isTablet,
  touchLayout,
  mobileHeaderTitle,
  onShellHeaderAction,
}: BoardSettingsModalMobileShellProps) {
  const showBoardRows = effectiveTopTab === 'board' && mobileDetail == null;
  const showThemeRows = effectiveTopTab === 'theme' && mobileDetail == null;

  return (
    <Modal
      opened={true}
      onClose={onClose}
      fullScreen
      withinPortal={false}
      transitionProps={{ duration: 0 }}
      overlayProps={{ backgroundOpacity: 0.55, blur: 0 }}
      withCloseButton={false}
      title={null}
      classNames={{
        inner: `board-settings-modal__inner board-settings-modal__inner--${shellModifier}`,
        content: `board-settings-modal__content board-settings-modal__content--${shellModifier}`,
        body: `board-settings-modal__body board-settings-modal__body--${shellModifier}`,
      }}
    >
      <Box className="board-settings-modal__mobile-shell">
        <Group
          className={
            isTablet
              ? 'board-settings-modal__mobile-header board-settings-modal__mobile-header--tablet'
              : 'board-settings-modal__mobile-header'
          }
          gap="sm"
          wrap="nowrap"
          align="center"
        >
          {isTablet ? (
            <>
              <Title order={2} size="h4" style={{ flex: 1, minWidth: 0 }}>
                {mobileHeaderTitle}
              </Title>
              <ActionIcon
                type="button"
                variant="subtle"
                color="gray"
                size="lg"
                radius="md"
                onClick={onShellHeaderAction}
                aria-label={mobileDetail != null ? 'Go back' : 'Close board settings'}
              >
                <IconX size={22} stroke={1.5} />
              </ActionIcon>
            </>
          ) : (
            <>
              <ActionIcon
                type="button"
                variant="subtle"
                color="gray"
                size="lg"
                radius="md"
                onClick={onShellHeaderAction}
                aria-label="Go back"
              >
                <IconArrowLeft size={22} stroke={1.5} />
              </ActionIcon>
              <Title order={2} size="h4">
                {mobileHeaderTitle}
              </Title>
            </>
          )}
        </Group>

        <Group className="board-settings-modal__mobile-top-icons" gap={10} wrap="nowrap">
          {allowed.includes('board') ? (
            <ActionIcon
              type="button"
              size={44}
              radius="sm"
              variant={effectiveTopTab === 'board' ? 'filled' : 'light'}
              color={effectiveTopTab === 'board' ? 'blue' : 'gray'}
              aria-label="Board settings"
              onClick={() => {
                setTopTab('board');
                setMobileDetail(null);
              }}
            >
              <IconAdjustmentsHorizontal size={20} stroke={1.6} />
            </ActionIcon>
          ) : null}
          {allowed.includes('users') ? (
            <ActionIcon
              type="button"
              size={44}
              radius="sm"
              variant={effectiveTopTab === 'users' ? 'filled' : 'light'}
              color={effectiveTopTab === 'users' ? 'blue' : 'gray'}
              aria-label="Users & permissions"
              onClick={() => {
                setTopTab('users');
                setMobileDetail({ kind: 'users' });
              }}
            >
              <IconUsers size={20} stroke={1.6} />
            </ActionIcon>
          ) : null}
          {allowed.includes('theme') ? (
            <ActionIcon
              type="button"
              size={44}
              radius="sm"
              variant={effectiveTopTab === 'theme' ? 'filled' : 'light'}
              color={effectiveTopTab === 'theme' ? 'blue' : 'gray'}
              aria-label="Theme & background"
              onClick={() => {
                setTopTab('theme');
                setMobileDetail(null);
              }}
            >
              <IconPalette size={20} stroke={1.6} />
            </ActionIcon>
          ) : null}
          {allowed.includes('audit') ? (
            <ActionIcon
              type="button"
              size={44}
              radius="sm"
              variant={effectiveTopTab === 'audit' ? 'filled' : 'light'}
              color={effectiveTopTab === 'audit' ? 'blue' : 'gray'}
              aria-label="Audit log"
              onClick={() => {
                setTopTab('audit');
                setMobileDetail({ kind: 'audit' });
              }}
            >
              <IconHistory size={20} stroke={1.6} />
            </ActionIcon>
          ) : null}
          {allowed.includes('activity') ? (
            <ActionIcon
              type="button"
              size={44}
              radius="sm"
              variant={effectiveTopTab === 'activity' ? 'filled' : 'light'}
              color={effectiveTopTab === 'activity' ? 'blue' : 'gray'}
              aria-label="Activity log"
              onClick={() => {
                setTopTab('activity');
                setMobileDetail({ kind: 'activity' });
              }}
            >
              <IconHeartRateMonitor size={20} stroke={1.6} />
            </ActionIcon>
          ) : null}
        </Group>

        {mobileDetail == null ? (
          <Stack gap="xs" className="board-settings-modal__mobile-rows">
            {showBoardRows ? (
              <>
                <button
                  type="button"
                  className="board-settings-modal__mobile-row"
                  onClick={() => setMobileDetail({ kind: 'board', section: 'card-settings' })}
                >
                  Card settings
                </button>
                <button
                  type="button"
                  className="board-settings-modal__mobile-row"
                  onClick={() => setMobileDetail({ kind: 'board', section: 'list-settings' })}
                >
                  List settings
                </button>
                <button
                  type="button"
                  className="board-settings-modal__mobile-row"
                  onClick={() => setMobileDetail({ kind: 'board', section: 'labels' })}
                >
                  Labels
                </button>
              </>
            ) : null}
            {showThemeRows ? (
              <>
                <button
                  type="button"
                  className="board-settings-modal__mobile-row"
                  onClick={() => setMobileDetail({ kind: 'theme', section: 'theme-colouring' })}
                >
                  Theme &amp; colouring
                </button>
                <button
                  type="button"
                  className="board-settings-modal__mobile-row"
                  onClick={() => setMobileDetail({ kind: 'theme', section: 'background' })}
                >
                  Background
                </button>
              </>
            ) : null}
          </Stack>
        ) : (
          <Box
            className={
              mobileDetail.kind === 'users'
                ? 'board-settings-modal__mobile-content board-settings-modal__mobile-content--users'
                : mobileDetail.kind === 'audit' || mobileDetail.kind === 'activity'
                  ? 'board-settings-modal__mobile-content board-settings-modal__mobile-content--audit'
                  : mobileDetail.kind === 'board' &&
                      (mobileDetail.section === 'card-settings' ||
                        mobileDetail.section === 'list-settings')
                    ? 'board-settings-modal__mobile-content board-settings-modal__mobile-content--settings-scroll'
                    : 'board-settings-modal__mobile-content'
            }
          >
            {mobileDetail.kind === 'board' && mobileDetail.section === 'card-settings' ? (
              <BoardSettingsCardSettingsPanel
                boardId={boardId}
                mobileLayout={touchLayout}
                {...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {})}
              />
            ) : null}
            {mobileDetail.kind === 'board' && mobileDetail.section === 'list-settings' ? (
              <BoardSettingsListSettingsPanel
                boardId={boardId}
                mobileLayout={touchLayout}
                {...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {})}
              />
            ) : null}
            {mobileDetail.kind === 'board' && mobileDetail.section === 'labels' ? (
              <Suspense fallback={<TabPanelFallback />}>
                <LabelManagement boardId={boardId} layout="settings" />
              </Suspense>
            ) : null}
            {mobileDetail.kind === 'users' ? (
              <Suspense fallback={<TabPanelFallback />}>
                <BoardMemberManagement key={boardId} boardId={boardId} />
              </Suspense>
            ) : null}
            {mobileDetail.kind === 'theme' ? (
              <BoardThemeBackgroundTab
                key={`${boardId}-${mobileDetail.section}`}
                boardId={boardId}
                canChangeTheme={allowed.includes('theme')}
                canManageCustomThemes={canManageCustomThemes}
                {...(onThemeLivePatch !== undefined ? { onThemeLivePatch } : {})}
                initialNav={mobileDetail.section === 'background' ? 'background' : 'theme'}
                mobileLayout={touchLayout}
              />
            ) : null}
            {mobileDetail.kind === 'audit' ? (
              <Suspense fallback={<TabPanelFallback />}>
                <MemberAuditLog
                  boardId={boardId}
                  mobileLayout={touchLayout}
                  {...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {})}
                />
              </Suspense>
            ) : null}
            {mobileDetail.kind === 'activity' ? (
              <Suspense fallback={<TabPanelFallback />}>
                <BoardActivityLog
                  boardId={boardId}
                  mobileLayout={touchLayout}
                  {...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {})}
                />
              </Suspense>
            ) : null}
          </Box>
        )}
      </Box>
    </Modal>
  );
}
