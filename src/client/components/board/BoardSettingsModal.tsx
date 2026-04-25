import { lazy, Suspense, useState } from 'react';
import {
  Box,
  Center,
  Flex,
  Loader,
  Modal,
  NavLink,
  Stack,
  Tabs,
} from '@mantine/core';
import { IconAdjustmentsHorizontal, IconHistory, IconList, IconTag } from '@tabler/icons-react';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import { BoardSettingsListSettingsPanel } from './BoardSettingsListSettingsPanel.js';
import { BoardSettingsCardSettingsPanel } from './BoardSettingsCardSettingsPanel.js';
import { BoardThemeBackgroundTab } from './BoardThemeBackgroundTab.js';
import './boardSettingsModal.css';

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
}

type TopTab = 'board' | 'users' | 'theme' | 'audit';
type BoardSideNav = 'card-settings' | 'list-settings' | 'labels';

export function BoardSettingsModal({
  boardId,
  onClose,
  onSettingsLivePatch,
  onThemeLivePatch,
  allowedTopTabs,
}: BoardSettingsModalProps) {
  const [topTab, setTopTab] = useState<TopTab>('board');
  const [boardSideNav, setBoardSideNav] = useState<BoardSideNav>('labels');
  const allowed = allowedTopTabs ?? (['board', 'users', 'theme', 'audit'] as const);
  const effectiveTopTab = allowed.includes(topTab) ? topTab : (allowed[0] as TopTab);

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
          onChange={(value) => setTopTab((value || effectiveTopTab) as TopTab)}
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
            <BoardThemeBackgroundTab boardId={boardId} {...(onThemeLivePatch !== undefined ? { onThemeLivePatch } : {})} />
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
