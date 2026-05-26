import { Fragment, type ReactElement } from 'react';
import { IconGripVertical, IconPlus } from '@tabler/icons-react';
import { ActionIcon, Box, Group, Menu, Stack, Text, Title } from '@mantine/core';
import type { BoardDB, WorkspaceDB } from '../../store/database.js';
import { HomeBoardCardTile } from './HomeBoardCardTile.js';
import type { HomePageController } from './useHomePageController.js';

interface HomeWorkspaceSectionProps {
  readonly workspace: WorkspaceDB;
  readonly workspaceBoards: readonly BoardDB[];
  readonly fullIndex: number;
  readonly controller: HomePageController;
}

export function HomeWorkspaceSection({
  workspace,
  workspaceBoards,
  fullIndex,
  controller,
}: HomeWorkspaceSectionProps) {
  const boardScopedHomeOnly = workspace.boardScopedHomeOnly === true;
  const wsManage = controller.canManageWorkspace(workspace);
  const wsUpdate = controller.canUpdateWorkspace(workspace);
  const wsDeletePerm = controller.canDeleteWorkspace(workspace.id);
  const canCreateBoardInWs = controller.canCreateBoardInWorkspace(workspace);

  return (
    <>
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
            <WorkspaceHeaderAndBoards
              workspace={workspace}
              workspaceBoards={workspaceBoards}
              controller={controller}
              boardScopedHomeOnly={boardScopedHomeOnly}
              wsManage={wsManage}
              wsUpdate={wsUpdate}
              wsDeletePerm={wsDeletePerm}
              canCreateBoardInWs={canCreateBoardInWs}
            />
          </Stack>
        </Box>
      </Group>
    </>
  );
}

function WorkspaceHeaderAndBoards({
  workspace,
  workspaceBoards,
  controller,
  boardScopedHomeOnly,
  wsManage,
  wsUpdate,
  wsDeletePerm,
  canCreateBoardInWs,
}: {
  readonly workspace: WorkspaceDB;
  readonly workspaceBoards: readonly BoardDB[];
  readonly controller: HomePageController;
  readonly boardScopedHomeOnly: boolean;
  readonly wsManage: boolean;
  readonly wsUpdate: boolean;
  readonly wsDeletePerm: boolean;
  readonly canCreateBoardInWs: boolean;
}): ReactElement {
  return (
    <>
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
          <BoardGridWithDropIndicator
            workspaceBoards={workspaceBoards}
            workspaceId={workspace.id}
            controller={controller}
            boardScopedHomeOnly={boardScopedHomeOnly}
            canCreateBoardInWs={canCreateBoardInWs}
          />
        ) : (
          <>
            {controller.isMobile && controller.boardDropIndicator?.workspaceId === workspace.id ? (
              <div className="home-page__board-drop-indicator" aria-hidden />
            ) : null}
            <Text ta="center" c="dimmed" py="md" size="sm">
              {boardScopedHomeOnly
                ? 'No boards shared with you in this workspace yet.'
                : canCreateBoardInWs
                  ? 'No boards in this workspace. Click + beside the title to add one.'
                  : 'No boards in this workspace yet.'}
            </Text>
          </>
        )}
      </div>
    </>
  );
}

function BoardGridWithDropIndicator({
  workspaceBoards,
  workspaceId,
  controller,
}: {
  readonly workspaceBoards: readonly BoardDB[];
  readonly workspaceId: string;
  readonly controller: HomePageController;
  readonly boardScopedHomeOnly: boolean;
  readonly canCreateBoardInWs: boolean;
}): ReactElement {
  const indicator = controller.isMobile ? controller.boardDropIndicator : null;
  const showIndicator = indicator != null && indicator.workspaceId === workspaceId;
  const showAtEnd = showIndicator && indicator.anchorBoardId == null;

  return (
    <>
      {workspaceBoards.map((board) => (
        <Fragment key={board.id}>
          {showIndicator && indicator.anchorBoardId === board.id ? (
            <div className="home-page__board-drop-indicator" aria-hidden />
          ) : null}
          <HomeBoardCardTile
            board={board}
            workspaceId={workspaceId}
            showBoardCardMenu={controller.canShowBoardCardMenu(board.id)}
            boardDraggable={controller.canDragBoardOnHome(board)}
            isDraggingSource={controller.draggingBoardId === board.id}
            {...(controller.boardLongPressUi?.boardId === board.id
              ? { reorderLongPressPhase: controller.boardLongPressUi.phase }
              : {})}
            suppressNavigateRef={controller.suppressBoardClickRef}
            hoveredBoardId={controller.hoveredBoardId}
            onHover={controller.setHoveredBoardId}
            onOpenBoard={controller.openBoard}
            onRefresh={controller.refreshData}
          />
        </Fragment>
      ))}
      {showAtEnd ? <div className="home-page__board-drop-indicator" aria-hidden /> : null}
    </>
  );
}
