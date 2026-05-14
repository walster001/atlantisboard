import { Fragment } from 'react';
import { IconFileImport, IconGripVertical, IconLayoutKanbanFilled, IconPlus } from '@tabler/icons-react';
import { ActionIcon, Box, Button, Group, Loader, Menu, Stack, Text, Title } from '@mantine/core';
import { OfflineIndicator } from '../../components/OfflineIndicator.js';
import { UserMenu } from '../../components/UserMenu.js';
import { HomeBoardCardTile } from './HomeBoardCardTile.js';
import { type HomePageController } from './useHomePageController.js';
import { HomePageDragPreview, HomePageModals } from './HomePageAuxiliary.js';
import { useIsPwa } from '../../hooks/usePwaDisplayMode.js';

interface HomePageLayoutProps {
  readonly controller: HomePageController;
}

export function HomePageLayout({ controller }: HomePageLayoutProps) {
  const isPwa = useIsPwa();
  if (controller.loading) {
    return (
      <Box className="home-page__loading">
        <Loader size="lg" />
      </Box>
    );
  }

  return (
    <Box
      className={`home-page${controller.homePageDragging ? ' home-page--dragging' : ''}${
        controller.isMobile ? ' home-page--mobile' : controller.responsiveTier === 'tablet' ? ' home-page--tablet' : ''
      }${isPwa ? ' home-page--pwa' : ''}`}
      style={controller.homePageRootStyle}
    >
      <HomePageDragPreview controller={controller} />

      <Box className="home-page__nav" style={{ backgroundColor: controller.homeNavbarColor }}>
        <Box className="home-page__nav-inner">
          <Box className="home-page__nav-brand">
            <Group gap="xs" wrap="nowrap" align="center">
              {controller.homeNavIconUrl !== null ? (
                <img
                  src={controller.homeNavIconUrl}
                  alt=""
                  width={controller.homeNavIconPx}
                  height={controller.homeNavIconPx}
                  className="home-page__nav-brand-favicon"
                />
              ) : (
                <IconLayoutKanbanFilled
                  size={controller.homeNavIconPx}
                  className="home-page__logo-icon"
                  aria-hidden
                />
              )}
              <span className="home-page__nav-brand-label" style={controller.homeNavLabelStyle}>
                {controller.homeNavLabel}
              </span>
            </Group>
          </Box>
          <Group gap="md">
            <OfflineIndicator />
            <UserMenu
              showDisplayName={!controller.isMobile}
              nameClassName="home-page__user-name"
              nameStyle={controller.homeUserNameStyle}
              {...(controller.isMobile ? { avatarSize: 38 } : {})}
            />
          </Group>
        </Box>
      </Box>

      <Box className="home-page__main" style={controller.homeMainStyle}>
        <Box ref={controller.listRootRef} className="home-page__list-root">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
              <Title order={1} className="home-page__title">
                Your Workspaces
              </Title>
              <Group
                gap="xs"
                wrap="nowrap"
                className={`home-page__actions${controller.isMobile ? ' home-page__actions--icon-only' : ''}`}
              >
                {controller.isMobile ? (
                  <>
                    <ActionIcon
                      variant="default"
                      size="lg"
                      radius="md"
                      className="home-page__import-btn home-page__import-btn--icon-only"
                      onClick={controller.openImportModal}
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
                      onClick={controller.openCreateWorkspace}
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
                      onClick={controller.openImportModal}
                    >
                      Import
                    </Button>
                    <Button
                      color="blue"
                      size="sm"
                      className="home-page__new-workspace-btn"
                      leftSection={<span className="home-page__icon-plus">+</span>}
                      onClick={controller.openCreateWorkspace}
                    >
                      New Workspace
                    </Button>
                  </>
                )}
              </Group>
            </Group>

            {controller.orderedWorkspaces.map((workspace, fullIndex) => {
              const workspaceBoards = controller.boardsByWorkspaceMap.get(workspace.id) ?? [];
              const boardScopedHomeOnly = workspace.boardScopedHomeOnly === true;
              const wsManage = controller.canManageWorkspace(workspace);
              const wsUpdate = controller.canUpdateWorkspace(workspace);
              const wsDeletePerm = controller.canDeleteWorkspace(workspace.id);
              const canCreateBoardInWs = controller.canCreateBoardInWorkspace(workspace);
              return (
                <Fragment key={workspace.id}>
                  {controller.workspaceInsertLineBeforeFullIndex === fullIndex ? (
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
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
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
                              onClick={() => controller.openCreateBoard(workspace.id)}
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
                                  <Menu.Item onClick={() => controller.openRenameWorkspace(workspace)}>
                                    Rename workspace
                                  </Menu.Item>
                                ) : null}
                                {wsUpdate ? (
                                  <Menu.Item onClick={() => controller.openEditDescription(workspace)}>
                                    Edit description
                                  </Menu.Item>
                                ) : null}
                                {wsUpdate ? (
                                  <Menu.Item onClick={() => controller.openWorkspaceSettings(workspace.id)}>
                                    Workspace Settings
                                  </Menu.Item>
                                ) : null}
                                {wsUpdate && wsDeletePerm ? <Menu.Divider /> : null}
                                {wsDeletePerm ? (
                                  <Menu.Item color="red" onClick={() => controller.handleDeleteWorkspace(workspace.id)}>
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
                            controller.boardGridDropTargetWsId === workspace.id
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
                                showBoardCardMenu={controller.canShowBoardCardMenu(board.id)}
                                boardDraggable={controller.canDragBoardOnHome(board)}
                                isDraggingSource={controller.draggingBoardId === board.id}
                                suppressNavigateRef={controller.suppressBoardClickRef}
                                hoveredBoardId={controller.hoveredBoardId}
                                onHover={controller.setHoveredBoardId}
                                onOpenBoard={controller.openBoard}
                                onRefresh={controller.refreshData}
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

            {controller.workspaceInsertLineBeforeFullIndex === controller.orderedWorkspaces.length ? (
              <Box className="home-page__workspace-insert-line" />
            ) : null}

            {controller.orderedWorkspaces.length === 0 ? (
              <Box ta="center" py="xl">
                <Text c="dimmed" mb="md">
                  No workspaces yet.
                </Text>
                <Text c="dimmed" size="sm">
                  Create a private workspace to hold your boards, then add boards there.
                </Text>
              </Box>
            ) : null}
          </Stack>
        </Box>
      </Box>

      <HomePageModals controller={controller} />
    </Box>
  );
}
