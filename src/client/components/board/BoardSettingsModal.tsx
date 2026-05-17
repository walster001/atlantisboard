import { lazy, Suspense, useState } from 'react';
import {
  ActionIcon,
  Box,
  Center,
  Flex,
  Group,
  Loader,
  Modal,
  NavLink,
  Stack,
  Tabs,
  Title,
} from '@mantine/core';
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconHistory,
  IconList,
  IconPalette,
  IconTag,
  IconUsers,
} from '@tabler/icons-react';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import { BoardSettingsListSettingsPanel } from './BoardSettingsListSettingsPanel.js';
import { BoardSettingsCardSettingsPanel } from './BoardSettingsCardSettingsPanel.js';
import { BoardThemeBackgroundTab } from './BoardThemeBackgroundTab.js';
import './boardSettingsModal.css';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { useIsPwa } from '../../hooks/usePwaDisplayMode.js';

const LabelManagement = lazy(async () => {
  const m = await import('./LabelManagement.js');
  return { default: m.LabelManagement };
});

const BoardMemberManagement = lazy(async () => {
  const m = await import('./BoardMemberManagement.js');
  return { default: m.BoardMemberManagement };
});

const ActivityLog = lazy(async () => {
  const m = await import('../activities/ActivityLog.js');
  return { default: m.ActivityLog };
});

function TabPanelFallback() {
  return (
    <Center py="xl">
      <Loader size="sm" />
    </Center>
  );
}

interface BoardSettingsModalProps {
  boardId: string;
  onClose: () => void;
  /** Merges into board state on the page so list width updates live while this modal is open. */
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
  onThemeLivePatch?: (patch: { themeSettings: BoardThemeSettings; background?: string }) => void;
  allowedTopTabs?: readonly TopTab[];
  canManageCustomThemes?: boolean;
}

type TopTab = 'board' | 'users' | 'theme' | 'audit';
type BoardSideNav = 'card-settings' | 'list-settings' | 'labels';
type ThemeSideNav = 'theme-colouring' | 'background';
type MobileDetail =
  | null
  | { readonly kind: 'board'; readonly section: BoardSideNav }
  | { readonly kind: 'users' }
  | { readonly kind: 'theme'; readonly section: ThemeSideNav }
  | { readonly kind: 'audit' };

export function BoardSettingsModal({
  boardId,
  onClose,
  onSettingsLivePatch,
  onThemeLivePatch,
  allowedTopTabs,
  canManageCustomThemes = false,
}: BoardSettingsModalProps) {
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const isPwa = useIsPwa();
  const [topTab, setTopTab] = useState<TopTab>('board');
  const [boardSideNav, setBoardSideNav] = useState<BoardSideNav>('labels');
  const [mobileDetail, setMobileDetail] = useState<MobileDetail>(null);
  const allowed = allowedTopTabs ?? (['board', 'users', 'theme', 'audit'] as const);
  const effectiveTopTab = allowed.includes(topTab) ? topTab : (allowed[0] as TopTab);

  const mobileHeaderTitle = (() => {
    if (mobileDetail == null) {
      return 'Board Settings';
    }
    if (mobileDetail.kind === 'users') {
      return 'Users & Permissions';
    }
    if (mobileDetail.kind === 'theme') {
      return mobileDetail.section === 'background' ? 'Background' : 'Theme & colouring';
    }
    if (mobileDetail.kind === 'audit') {
      return 'Audit Log';
    }
    return mobileDetail.section === 'card-settings'
      ? 'Card settings'
      : mobileDetail.section === 'list-settings'
        ? 'List settings'
        : 'Labels';
  })();

  if (isMobile || isPwa) {
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
          inner: 'board-settings-modal__inner board-settings-modal__inner--mobile',
          content: 'board-settings-modal__content board-settings-modal__content--mobile',
          body: 'board-settings-modal__body board-settings-modal__body--mobile',
        }}
      >
        <Box className="board-settings-modal__mobile-shell">
          <Group className="board-settings-modal__mobile-header" gap="sm" wrap="nowrap" align="center">
            <ActionIcon
              type="button"
              variant="subtle"
              color="gray"
              size="lg"
              radius="md"
              onClick={() => {
                if (mobileDetail != null) {
                  setMobileDetail(null);
                  return;
                }
                onClose();
              }}
              aria-label="Go back"
            >
              <IconArrowLeft size={22} stroke={1.5} />
            </ActionIcon>
            <Title order={2} size="h4">
              {mobileHeaderTitle}
            </Title>
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
                  : mobileDetail.kind === 'audit'
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
                  mobileLayout
                  {...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {})}
                />
              ) : null}
              {mobileDetail.kind === 'board' && mobileDetail.section === 'list-settings' ? (
                <BoardSettingsListSettingsPanel
                  boardId={boardId}
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
                  mobileLayout
                />
              ) : null}
              {mobileDetail.kind === 'audit' ? (
                <Suspense fallback={<TabPanelFallback />}>
                  <ActivityLog
                    boardId={boardId}
                    mobileLayout
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

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title="Board Settings"
      centered
      yOffset={0}
      size="100%"
      classNames={{
        inner: 'board-settings-modal__inner',
        content: 'board-settings-modal__content',
        header: 'board-settings-modal__header',
        body: 'board-settings-modal__body',
      }}
    >
      <Box className="board-settings-modal__scroll">
        <Tabs
          value={effectiveTopTab}
          onChange={(value: string | null) => setTopTab(((value || effectiveTopTab) as TopTab))}
          keepMounted={false}
          classNames={{
            root: 'board-settings-modal__tabs',
            list: 'board-settings-modal__tabs-list',
          }}
        >
          <Tabs.List>
            {allowed.includes('board') ? <Tabs.Tab value="board">Board Settings</Tabs.Tab> : null}
            {allowed.includes('users') ? <Tabs.Tab value="users">Users &amp; Permissions</Tabs.Tab> : null}
            {allowed.includes('theme') ? <Tabs.Tab value="theme">Theme &amp; Background</Tabs.Tab> : null}
            {allowed.includes('audit') ? (
              <Tabs.Tab value="audit" leftSection={<IconHistory size={18} stroke={1.5} />}>
                Audit Log
              </Tabs.Tab>
            ) : null}
          </Tabs.List>

          <Tabs.Panel
            value="board"
            pt="md"
            keepMounted
            className="board-settings-modal__tab-panel board-settings-modal__tab-panel--board"
          >
            <Flex align="stretch" gap={0} wrap="nowrap" className="board-settings-modal__board-layout">
              <Stack gap={4} className="board-settings-modal__sidenav board-settings-modal__sidenav--sticky">
                <NavLink
                  label="Card settings"
                  leftSection={<IconAdjustmentsHorizontal size={18} stroke={1.5} />}
                  active={boardSideNav === 'card-settings'}
                  onClick={() => setBoardSideNav('card-settings')}
                  variant="subtle"
                />
                <NavLink
                  label="List settings"
                  leftSection={<IconList size={18} stroke={1.5} />}
                  active={boardSideNav === 'list-settings'}
                  onClick={() => setBoardSideNav('list-settings')}
                  variant="subtle"
                />
                <NavLink
                  label="Labels"
                  leftSection={<IconTag size={18} stroke={1.5} />}
                  active={boardSideNav === 'labels'}
                  onClick={() => setBoardSideNav('labels')}
                  variant="subtle"
                />
              </Stack>
              <Box className="board-settings-modal__main board-settings-modal__main--scrollable">
                {boardSideNav === 'card-settings' ? (
                  <BoardSettingsCardSettingsPanel
                    boardId={boardId}
                    {...(onSettingsLivePatch !== undefined
                      ? { onSettingsLivePatch }
                      : {})}
                  />
                ) : null}
                {boardSideNav === 'list-settings' ? (
                  <BoardSettingsListSettingsPanel
                    boardId={boardId}
                    {...(onSettingsLivePatch !== undefined
                      ? { onSettingsLivePatch }
                      : {})}
                  />
                ) : null}
                {boardSideNav === 'labels' ? (
                  <Suspense fallback={<TabPanelFallback />}>
                    <LabelManagement boardId={boardId} layout="settings" />
                  </Suspense>
                ) : null}
              </Box>
            </Flex>
          </Tabs.Panel>

          <Tabs.Panel
            value="users"
            pt="md"
            className="board-settings-modal__tab-panel board-settings-modal__tab-panel--fill"
          >
            <Box className="board-settings-modal__users-panel-inner">
              <Suspense fallback={<TabPanelFallback />}>
                <BoardMemberManagement key={boardId} boardId={boardId} />
              </Suspense>
            </Box>
          </Tabs.Panel>

          <Tabs.Panel value="theme" pt="md" className="board-settings-modal__tab-panel">
            <BoardThemeBackgroundTab
              boardId={boardId}
              canChangeTheme={allowed.includes('theme')}
              canManageCustomThemes={canManageCustomThemes}
              {...(onThemeLivePatch !== undefined ? { onThemeLivePatch } : {})}
            />
          </Tabs.Panel>

          <Tabs.Panel
            value="audit"
            pt="md"
            className="board-settings-modal__tab-panel board-settings-modal__tab-panel--fill"
          >
            <Box className="board-settings-modal__users-panel-inner">
              <Suspense fallback={<TabPanelFallback />}>
                <ActivityLog
                  boardId={boardId}
                  {...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {})}
                />
              </Suspense>
            </Box>
          </Tabs.Panel>
        </Tabs>
      </Box>
    </Modal>
  );
}
