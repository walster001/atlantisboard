import { api } from '../../utils/api.js';
import type { BoardDB } from '../../store/database.js';
import { transformBoard } from '../../utils/transform.js';

export const HOME_BOARDS_PAGE_SIZE = 100;
export const HOME_BOARD_CARD_ROOT_STYLES = { root: { overflow: 'visible' } } as const;

export const HOME_WORKSPACE_SUMMARY_FIELDS = [
  'name',
  'description',
  'ownerId',
  'members',
  'createdAt',
  'updatedAt',
  'boardScopedHomeOnly',
] as const;

export const HOME_BOARD_SUMMARY_FIELDS = [
  'workspaceId',
  'position',
  'name',
  'description',
  'background',
  'visibility',
  'ownerId',
  'members',
  'createdAt',
  'updatedAt',
] as const;

export async function loadAllHomeBoardSummaries(): Promise<BoardDB[]> {
  const acc: BoardDB[] = [];
  let skip = 0;
  for (;;) {
    const boardsResponse = await api.getBoards({
      view: 'summary',
      fields: [...HOME_BOARD_SUMMARY_FIELDS],
      skip,
      limit: HOME_BOARDS_PAGE_SIZE,
    });
    const rawBoards = boardsResponse.boards;
    acc.push(...rawBoards.map((board) => transformBoard(board)));
    if (boardsResponse.hasMore !== true || rawBoards.length < HOME_BOARDS_PAGE_SIZE) {
      break;
    }
    skip += HOME_BOARDS_PAGE_SIZE;
  }
  return acc;
}
