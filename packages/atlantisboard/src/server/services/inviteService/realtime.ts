import { Board } from '../../models/Board.js';
import { Workspace } from '../../models/Workspace.js';
import type { IInviteLink } from '../../models/InviteLink.js';
import { emitBoardUpdatedRealtime } from '../boardService.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../../utils/socketIO.js';
import mongoose from 'mongoose';
import type { Document } from 'mongoose';
import { uniqueUserIds } from './typesAndHelpers.js';

async function getInviteAudienceUserIds(invite: Document & IInviteLink): Promise<string[]> {
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();

  if (boardId) {
    const board = await Board.findById(boardId).select('ownerId members.userId').lean();
    if (!board) {
      return uniqueUserIds([invite.createdBy.toString()]);
    }
    const memberIds = (board.members ?? []).map((m) => String(m.userId));
    return uniqueUserIds([String(board.ownerId), ...memberIds, invite.createdBy.toString()]);
  }

  if (workspaceId) {
    const workspace = await Workspace.findById(workspaceId).select('ownerId members.userId').lean();
    if (!workspace) {
      return uniqueUserIds([invite.createdBy.toString()]);
    }
    const memberIds = (workspace.members ?? []).map((m) => String(m.userId));
    return uniqueUserIds([String(workspace.ownerId), ...memberIds, invite.createdBy.toString()]);
  }

  return uniqueUserIds([invite.createdBy.toString()]);
}

export function emitInviteCreatedRealtime(invite: Document & IInviteLink): void {
  const inviteId = invite._id.toString();
  const serverTs = Date.now();
  const data = invite.toObject() as Record<string, unknown>;
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'invite:created', {
      inviteId,
      workspaceId,
      boardId,
      data,
      serverTs,
    });
  }
  if (boardId) {
    emitToBoard(boardId, 'invite:created', { inviteId, boardId, data, serverTs });
  }
  void getInviteAudienceUserIds(invite)
    .then((userIds) => {
      for (const uid of userIds) {
        emitToUser(uid, 'invite:created', { inviteId, workspaceId, boardId, data, serverTs });
      }
    })
    .catch(() => undefined);
}

export function emitInviteUpdatedRealtime(invite: Document & IInviteLink): void {
  const inviteId = invite._id.toString();
  const serverTs = Date.now();
  const data = invite.toObject() as Record<string, unknown>;
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'invite:updated', {
      inviteId,
      workspaceId,
      boardId,
      data,
      serverTs,
    });
  }
  if (boardId) {
    emitToBoard(boardId, 'invite:updated', { inviteId, boardId, data, serverTs });
  }
  void getInviteAudienceUserIds(invite)
    .then((userIds) => {
      for (const uid of userIds) {
        emitToUser(uid, 'invite:updated', { inviteId, workspaceId, boardId, data, serverTs });
      }
    })
    .catch(() => undefined);
}

export function emitInviteDeletedRealtime(invite: Document & IInviteLink): void {
  const inviteId = invite._id.toString();
  const serverTs = Date.now();
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'invite:deleted', {
      inviteId,
      workspaceId,
      boardId,
      serverTs,
    });
  }
  if (boardId) {
    emitToBoard(boardId, 'invite:deleted', { inviteId, boardId, serverTs });
  }
  void getInviteAudienceUserIds(invite)
    .then((userIds) => {
      for (const uid of userIds) {
        emitToUser(uid, 'invite:deleted', { inviteId, workspaceId, boardId, serverTs });
      }
    })
    .catch(() => undefined);
}

export async function addUserToAllBoardsInWorkspace(params: {
  workspaceId: string;
  user: Document & { _id: mongoose.Types.ObjectId; displayName?: string | null };
  roleKey: string;
}): Promise<void> {
  const { workspaceId, user, roleKey } = params;
  const boards = await Board.find({ workspaceId }).select('_id ownerId members').lean();
  if (boards.length === 0) return;

  const boardsToTouch = boards
    .filter((b) => String(b.ownerId) !== String(user._id))
    .filter(
      (b) =>
        !((b.members as Array<{ userId: unknown }>).some((m) => String(m.userId) === String(user._id))),
    );

  const bulk = boardsToTouch.map((b) => ({
    updateOne: {
      filter: { _id: b._id },
      update: {
        $push: {
          members: {
            userId: user._id,
            roleKey,
            addedAt: new Date(),
          },
        },
      },
    },
  }));

  if (bulk.length > 0) {
    await Board.bulkWrite(bulk);
    for (const b of boardsToTouch) {
      const full = await Board.findById(b._id);
      if (full) {
        emitBoardUpdatedRealtime(full);
      }
    }
  }
}
