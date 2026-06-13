import { Box, Card, Text } from '@mantine/core';
import type { MutableRefObject } from 'react';
import type { BoardDB } from '../../store/database.js';
import { BoardCardMenu } from '../../components/board/BoardCardMenu.js';
import { resolveHomeBoardTileCoverDisplay } from '../../utils/boardCoverDisplay.js';
import { HOME_BOARD_CARD_ROOT_STYLES } from './homePageData.js';

interface HomeBoardCardTileProps {
  readonly board: BoardDB;
  readonly workspaceId: string;
  readonly showBoardCardMenu: boolean;
  /** Whole tile is draggable when true (Kanban-style deadzone distinguishes drag vs click). */
  readonly boardDraggable: boolean;
  readonly isDraggingSource: boolean;
  readonly reorderLongPressPhase?: 'arming' | 'armed';
  readonly suppressNavigateRef: MutableRefObject<boolean>;
  readonly hoveredBoardId: string | null;
  readonly onHover: (id: string | null) => void;
  readonly onOpenBoard: (id: string) => void;
  readonly onRefresh: () => void | Promise<void>;
}

export function HomeBoardCardTile({
  board,
  workspaceId,
  showBoardCardMenu,
  boardDraggable,
  isDraggingSource,
  reorderLongPressPhase,
  suppressNavigateRef,
  hoveredBoardId,
  onHover,
  onOpenBoard,
  onRefresh,
}: HomeBoardCardTileProps) {
  const cover = resolveHomeBoardTileCoverDisplay(board.background);
  const touchReorderActive = reorderLongPressPhase === 'arming' || reorderLongPressPhase === 'armed';

  return (
    <Card
      data-home-board-id={board.id}
      data-home-workspace-id={workspaceId}
      {...(boardDraggable ? { 'data-home-board-draggable': '1' } : {})}
      shadow="md"
      padding={0}
      radius="md"
      styles={HOME_BOARD_CARD_ROOT_STYLES}
      className={`home-page__board-card${isDraggingSource ? ' home-page__board-card--drag-source' : ''}${
        reorderLongPressPhase === 'arming' ? ' home-page__board-card--reorder-arming' : ''
      }${reorderLongPressPhase === 'armed' ? ' home-page__board-card--reorder-armed' : ''}`}
      style={
        boardDraggable
          ? {
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
              touchAction: touchReorderActive ? 'none' : 'pan-y',
            }
          : undefined
      }
      onContextMenu={(event) => {
        if (boardDraggable) {
          event.preventDefault();
        }
      }}
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
        w="100%"
        className={`home-page__board-card-header${cover.isImageBackground ? ' home-page__board-card-header--image' : ''}`}
        style={cover.headerStyle}
      >
        <div className="home-page__board-card-title-row">
          <span
            className="home-page__board-card-title"
            style={{
              color: cover.headerTextColor,
              ...(boardDraggable
                ? { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }
                : {}),
            }}
          >
            {board.name}
          </span>
          <div
            className="home-page__board-card-menu-slot"
            data-home-board-no-drag="1"
            style={{
              opacity: showBoardCardMenu && hoveredBoardId === board.id ? 1 : 0,
              pointerEvents: showBoardCardMenu ? 'auto' : 'none',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {showBoardCardMenu ? (
              <BoardCardMenu
                boardId={board.id}
                boardName={board.name}
                boardDescription={board.description ?? ''}
                boardBackground={board.background ?? ''}
                menuIconColor={cover.menuIconColor}
                onBoardUpdated={onRefresh}
                onBoardDeleted={onRefresh}
              />
            ) : null}
          </div>
        </div>
      </Box>
      <Box p="md" className="home-page__board-card-body">
        {board.description?.trim() ? (
          <Text
            size="md"
            fw={400}
            c="dimmed"
            className="home-page__board-card-desc"
            style={
              boardDraggable
                ? { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }
                : undefined
            }
          >
            {board.description.trim()}
          </Text>
        ) : null}
      </Box>
    </Card>
  );
}
