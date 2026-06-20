import { type Document } from 'mongoose';
import { Board, type IBoard } from '../../models/Board.js';
import { Workspace } from '../../models/Workspace.js';
import { emitToUser } from '../../utils/socketIO.js';
import { isBoardMember } from '../../utils/permissions.js';
import type { BoardSummaryDTO } from '../../../shared/types/viewModels.js';
import { getBoardKanbanSnapshot } from '../cardService.js';
import {
  hydrateBoardDocumentForUser,
  hydrateBoardSummaryForUser,
} from '../boardThemeService.js';
import {
  ensureLegacyBoardPositions,
  toBoardSummary,
} from './shared.js';
import type {
  BoardKanbanSnapshotForUser,
  BoardListQueryOptions,
  BoardViewMode,
} from './types.js';

export async function getBoardById(
  boardId: string,
  userId: string,
  options?: { view?: BoardViewMode },
): Promise<((Document & IBoard) | BoardSummaryDTO) | null> {
  const view = options?.view ?? 'detail';
  const boardQuery = Board.findById(boardId);
  if (view === 'detail') {
    boardQuery
      .populate('ownerId', 'displayName email profilePicture')
      .populate('members.userId', 'displayName email profilePicture');
  }
  const board = await boardQuery;
  if (!board) {
    return null;
  }

  if (board.ownerId.toString() === userId) {
    return view === 'summary'
      ? hydrateBoardSummaryForUser(toBoardSummary(board), userId)
      : hydrateBoardDocumentForUser(board, userId);
  }
  if (await isBoardMember(userId, boardId)) {
    return view === 'summary'
      ? hydrateBoardSummaryForUser(toBoardSummary(board), userId)
      : hydrateBoardDocumentForUser(board, userId);
  }
  if (board.visibility === 'public') {
    return view === 'summary'
      ? hydrateBoardSummaryForUser(toBoardSummary(board), userId)
      : hydrateBoardDocumentForUser(board, userId);
  }

  return null;
}

export async function getUserBoards(
  userId: string,
  workspaceId?: string,
  options?: BoardListQueryOptions,
): Promise<Array<(Document & IBoard) | BoardSummaryDTO>> {
  await ensureLegacyBoardPositions();

  if (workspaceId) {
    return getBoardsByWorkspace(workspaceId, userId, options);
  }

  // Workspaces where the user is owner or workspace member: include every board in those workspaces.
  // Board-only membership (not a workspace member) must NOT expand to other boards in the same workspace;
  // those boards are covered only by the owner/member clauses below.
  const memberWorkspaces = await Workspace.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }).select('_id');
  const memberWorkspaceIds = memberWorkspaces.map((w) => w._id);

  // Home list is membership-based (not board visibility): public boards are not listed here unless the user
  // is a workspace member, owner, or explicit board member.
  let boardQuery = Board.find({
    $or: [
      { workspaceId: { $in: memberWorkspaceIds } },
      { ownerId: userId },
      { 'members.userId': userId },
    ],
  }).sort({ createdAt: -1 });
  if (options?.limit != null) {
    const skip = Math.max(0, options.skip ?? 0);
    boardQuery = boardQuery.skip(skip).limit(options.limit);
  }
  const boards = await boardQuery;
  if (options?.view === 'summary') {
    return Promise.all(boards.map((board) => hydrateBoardSummaryForUser(toBoardSummary(board), userId)));
  }
  return Promise.all(boards.map((board) => hydrateBoardDocumentForUser(board, userId)));
}

export async function getBoardsByWorkspace(
  workspaceId: string,
  userId: string,
  options?: BoardListQueryOptions,
): Promise<Array<(Document & IBoard) | BoardSummaryDTO>> {
  await ensureLegacyBoardPositions();

  const workspace = await Workspace.findById(workspaceId)
    .select('ownerId members.userId')
    .lean();
  if (!workspace) {
    return [];
  }

  const isWorkspaceMember =
    workspace.ownerId.toString() === userId ||
    (workspace.members as Array<{ userId: unknown }>).some(
      (m) => m.userId != null && m.userId.toString() === userId,
    );

  const userHasBoardInWorkspace = !!(await Board.exists({
    workspaceId: workspace._id,
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }));

  if (!isWorkspaceMember && !userHasBoardInWorkspace) {
    return [];
  }

  // Workspace members see all boards in the workspace. Board-only users see only boards they own or are members of.
  let boardQuery = Board.find(
    isWorkspaceMember
      ? { workspaceId }
      : {
          workspaceId,
          $or: [{ ownerId: userId }, { 'members.userId': userId }],
        },
  ).sort({ position: 1, createdAt: -1 });
  if (options?.limit != null) {
    const skip = Math.max(0, options.skip ?? 0);
    boardQuery = boardQuery.skip(skip).limit(options.limit);
  }
  const boards = await boardQuery;
  if (options?.view === 'summary') {
    return Promise.all(boards.map((board) => hydrateBoardSummaryForUser(toBoardSummary(board), userId)));
  }
  return Promise.all(boards.map((board) => hydrateBoardDocumentForUser(board, userId)));
}

/**
 * After a user becomes a workspace member via members UI (not necessarily on each board's
 * `members` list), push board summaries to their `user:*` room so the home page can upsert tiles
 * without refresh. Mirrors {@link getBoardsByWorkspace} visibility.
 */
export async function emitWorkspaceBoardSummariesToUserForHome(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const summaries = (await getBoardsByWorkspace(workspaceId, userId, {
    view: 'summary',
  })) as BoardSummaryDTO[];
  const serverTs = Date.now();
  for (const s of summaries) {
    emitToUser(userId, 'board:updated', {
      boardId: s.id,
      data: { ...s },
      serverTs,
    });
  }
}

/**
 * When a user loses workspace membership, drop home tiles for boards they only saw via that
 * membership (not board owner and not an explicit board member).
 */
export async function emitBoardsHiddenOnHomeAfterWorkspaceRemoval(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const boards = await Board.find({ workspaceId })
    .select('_id ownerId members.userId')
    .lean();
  const serverTs = Date.now();
  for (const doc of boards) {
    const bid = doc._id.toString();
    const ownerOk = doc.ownerId != null && doc.ownerId.toString() === userId;
    const memberOk =
      (doc.members as ReadonlyArray<{ userId?: unknown }> | undefined)?.some(
        (m) => m.userId != null && m.userId.toString() === userId,
      ) ?? false;
    if (!ownerOk && !memberOk) {
      emitToUser(userId, 'board:deleted', { boardId: bid, serverTs });
    }
  }
}

export async function getBoardKanbanSnapshotForUser(
  boardId: string,
  userId: string,
  options?: { listLimit?: number },
): Promise<BoardKanbanSnapshotForUser | null> {
  const boardDoc = await Board.findById(boardId);
  if (!boardDoc) {
    return null;
  }
  const canAccess =
    boardDoc.ownerId.toString() === userId ||
    (await isBoardMember(userId, boardId)) ||
    boardDoc.visibility === 'public';
  if (!canAccess) {
    return null;
  }
  const snapshot = await getBoardKanbanSnapshot(boardId, options);
  return {
    board: await hydrateBoardSummaryForUser(toBoardSummary(boardDoc), userId),
    lists: snapshot.lists,
    cardsByList: snapshot.cardsByList,
  };
}
