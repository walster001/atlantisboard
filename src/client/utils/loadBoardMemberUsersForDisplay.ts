import { isAxiosError } from 'axios';
import { api } from './api.js';

const MONGO_OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/;

function normalizeEntityId(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof raw === 'object' && raw !== null && '_id' in raw) {
    const idVal = (raw as { _id: unknown })._id;
    if (typeof idVal === 'string' && idVal.trim().length > 0) {
      return idVal.trim();
    }
    if (
      idVal != null &&
      typeof idVal === 'object' &&
      'toString' in idVal &&
      typeof (idVal as { toString: () => string }).toString === 'function'
    ) {
      const s = (idVal as { toString: () => string }).toString().trim();
      return s.length > 0 ? s : undefined;
    }
  }
  return undefined;
}

function isAbortOrCancelError(error: unknown): boolean {
  return (
    (isAxiosError(error) && (error.code === 'ERR_CANCELED' || error.name === 'CanceledError')) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function isWorkspaceFetchSkippedStatus(status: number | undefined): boolean {
  return status === 404 || status === 403;
}

interface PopulatedUser {
  _id: string;
  displayName: string;
  profilePicture?: string;
  email: string;
}

export interface BoardMemberUserDisplay {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly profilePicture?: string;
}

function extractUser(userId: string | PopulatedUser): BoardMemberUserDisplay {
  if (typeof userId === 'string') {
    return { _id: userId, displayName: '', email: '' };
  }
  const u: BoardMemberUserDisplay = {
    _id: userId._id,
    displayName: userId.displayName || '',
    email: userId.email || '',
  };
  if (userId.profilePicture != null && userId.profilePicture !== '') {
    return { ...u, profilePicture: userId.profilePicture };
  }
  return u;
}

/**
 * Board owner + members from GET /boards/:id, merged with workspace directory when available
 * (same scope as card assignee picker).
 */
export async function loadBoardMemberUsersForDisplay(
  boardId: string,
  signal: AbortSignal,
): Promise<BoardMemberUserDisplay[]> {
  const boardResponse = await api.getBoard(boardId, { signal });
  const board = boardResponse as {
    board: {
      workspaceId?: unknown;
      ownerId?: string | PopulatedUser;
      members?: Array<{ userId: string | PopulatedUser }>;
    };
  };

  const members: BoardMemberUserDisplay[] = [];

  const pushUnique = (u: BoardMemberUserDisplay): void => {
    if (!members.some((m) => m._id === u._id)) {
      members.push(u);
    }
  };

  if (board.board.ownerId) {
    pushUnique(extractUser(board.board.ownerId));
  }

  if (board.board.members) {
    for (const member of board.board.members) {
      pushUnique(extractUser(member.userId));
    }
  }

  const workspaceId = normalizeEntityId(board.board.workspaceId);
  const shouldFetchWorkspace =
    workspaceId != null &&
    MONGO_OBJECT_ID_HEX.test(workspaceId) &&
    workspaceId !== boardId;

  if (shouldFetchWorkspace) {
    try {
      const workspaceResponse = await api.getWorkspace(workspaceId, { signal });
      const workspace = workspaceResponse as {
        workspace: {
          ownerId?: string | PopulatedUser;
          members?: Array<{ userId: string | PopulatedUser }>;
        };
      };

      if (workspace.workspace.ownerId) {
        pushUnique(extractUser(workspace.workspace.ownerId));
      }

      if (workspace.workspace.members) {
        for (const member of workspace.workspace.members) {
          pushUnique(extractUser(member.userId));
        }
      }
    } catch (error) {
      if (isAbortOrCancelError(error)) {
        return members;
      }
      if (!(isAxiosError(error) && isWorkspaceFetchSkippedStatus(error.response?.status))) {
        console.error('Error loading workspace members:', error);
      }
    }
  }

  return members;
}
