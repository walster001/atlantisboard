import { type Document } from 'mongoose';
import { Board, type IBoard } from '../../models/Board.js';
import { Workspace } from '../../models/Workspace.js';
import { User } from '../../models/User.js';
import { hasPermission } from '../../utils/permissions.js';
import {
  emitWorkspaceHomeAccessRefreshForUser,
  emitWorkspaceHomeSnapshotToUserById,
} from '../workspaceService.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../../utils/socketIO.js';
import {
  type BoardMemberRoleUpdateModeKey,
} from '../roleService.js';
import type { BoardSummaryDTO } from '../../../shared/types/viewModels.js';
import {
  boardShowsDueDateOnCards,
  boardShowsEndDateOnCards,
  boardShowsRemindersOnCards,
  boardShowsStartDateOnCards,
} from '../../../shared/utils/boardCardDateVisibility.js';
import { logger } from '../../utils/logger.js';
import type { BoardMemberAuditHints } from './types.js';

function buildBoardSocketPayload(board: Document & IBoard): {
  boardId: string;
  data: Record<string, unknown>;
  serverTs: number;
} {
  return {
    boardId: board._id.toString(),
    data: board.toObject() as Record<string, unknown>,
    serverTs: Date.now(),
  };
}

/**
 * Push full board document to a user who gained access but has no local copy yet (e.g. member add).
 * Existing viewers still receive `board:patched` only to avoid reverting in-flight theme edits.
 */
export function emitBoardDocumentToUser(board: Document & IBoard, userId: string): void {
  const payload = buildBoardSocketPayload(board);
  emitToUser(userId, 'board:updated', payload);
}

/**
 * Emit only `board:patched` without the full `board:updated` payload.
 * Use for operations that change non-theme fields (e.g. members) to avoid
 * sending dehydrated themeSettings that would revert the active theme on clients.
 */
export function emitBoardPatchedOnly(
  board: Document & IBoard,
  changedFields: Record<string, unknown>,
  extraNotifyUserIds?: readonly string[],
): void {
  const boardId = board._id.toString();
  const patchPayload = {
    boardId,
    changedFields,
    removedFields: [] as string[],
    serverTs: Date.now(),
    version: 2,
  };
  emitToBoard(boardId, 'board:patched', patchPayload);
  const ws = board.workspaceId?.toString();
  if (ws) {
    emitToWorkspace(ws, 'board:patched', patchPayload);
  }
  const ownerStr = board.ownerId.toString();
  emitToUser(ownerStr, 'board:patched', patchPayload);
  for (const m of board.members) {
    const uid = m.userId.toString();
    if (uid !== ownerStr) {
      emitToUser(uid, 'board:patched', patchPayload);
    }
  }
  if (extraNotifyUserIds != null) {
    for (const uid of extraNotifyUserIds) {
      if (uid !== ownerStr) {
        emitToUser(uid, 'board:patched', patchPayload);
      }
    }
  }
}

/** Fan-out like change streams: board room, workspace, owner, each member (+ optional extra user rooms). */
export function emitBoardUpdatedRealtime(
  board: Document & IBoard,
  extraNotifyUserIds?: readonly string[],
  patch?: { changedFields: Record<string, unknown>; removedFields?: readonly string[] },
): void {
  const payload = buildBoardSocketPayload(board);
  const boardId = payload.boardId;
  emitToBoard(boardId, 'board:updated', payload);
  const patchPayload = {
    boardId,
    changedFields:
      patch?.changedFields ?? {
        updatedAt: board.updatedAt,
      },
    removedFields: patch?.removedFields ?? [],
    serverTs: payload.serverTs,
    version: 2,
  };
  emitToBoard(boardId, 'board:patched', patchPayload);
  const ws = board.workspaceId?.toString();
  if (ws) {
    emitToWorkspace(ws, 'board:updated', payload);
    emitToWorkspace(ws, 'board:patched', patchPayload);
  }
  const ownerStr = board.ownerId.toString();
  emitToUser(ownerStr, 'board:updated', payload);
  emitToUser(ownerStr, 'board:patched', patchPayload);
  for (const m of board.members) {
    const uid = m.userId.toString();
    if (uid !== ownerStr) {
      emitToUser(uid, 'board:updated', payload);
      emitToUser(uid, 'board:patched', patchPayload);
    }
  }
  if (extraNotifyUserIds != null) {
    for (const uid of extraNotifyUserIds) {
      if (uid !== ownerStr) {
        emitToUser(uid, 'board:updated', payload);
        emitToUser(uid, 'board:patched', patchPayload);
      }
    }
  }
}

/**
 * Home and other views listen on the global socket; clients always join `user:*`. Board room alone
 * misses users who have not opened that board, so duplicate `permissions.updated` to affected users.
 */
export function emitBoardPermissionsUpdated(
  boardId: string,
  affectedUserIds: readonly string[],
  body: Record<string, unknown>,
): void {
  const serverTs = Date.now();
  const payload: Record<string, unknown> = {
    boardId,
    affectedUserIds,
    serverTs,
    ...body,
  };
  emitToBoard(boardId, 'permissions.updated', payload);
  const seen = new Set<string>();
  for (const raw of affectedUserIds) {
    const uid = raw.trim();
    if (uid !== '' && !seen.has(uid)) {
      seen.add(uid);
      emitToUser(uid, 'permissions.updated', payload);
    }
  }
}

export async function resolveBoardActorRoleKey(
  board: Document & IBoard,
  userId: string,
): Promise<string | null> {
  if (board.ownerId.toString() === userId) {
    return 'admin';
  }
  const boardMember = board.members.find((m) => m.userId.toString() === userId);
  if (boardMember != null && typeof boardMember.roleKey === 'string' && boardMember.roleKey.trim() !== '') {
    return boardMember.roleKey;
  }
  const workspace = await Workspace.findById(board.workspaceId)
    .select('ownerId members')
    .lean()
    .catch(() => null);
  if (workspace == null) {
    return null;
  }
  if (workspace.ownerId?.toString() === userId) {
    return 'admin';
  }
  const wsMember = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
    (m) => String(m.userId) === userId,
  );
  if (typeof wsMember?.roleKey === 'string' && wsMember.roleKey.trim() !== '') {
    return wsMember.roleKey.trim();
  }
  return null;
}

export async function resolveBoardRoleUpdateModeForActor(
  userId: string,
  boardId: string,
): Promise<BoardMemberRoleUpdateModeKey | null> {
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.any')) {
    return 'boards.members.role.update.any';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.samehigher')) {
    return 'boards.members.role.update.samehigher';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.samelower')) {
    return 'boards.members.role.update.samelower';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.higher')) {
    return 'boards.members.role.update.higher';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.lower')) {
    return 'boards.members.role.update.lower';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.same')) {
    return 'boards.members.role.update.same';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update')) {
    // Backward-compatible default for legacy roles with coarse update key.
    return 'boards.members.role.update.samelower';
  }
  return null;
}

export function emitBoardCreatedRealtime(board: Document & IBoard): void {
  const payload = buildBoardSocketPayload(board);
  const boardId = payload.boardId;
  emitToBoard(boardId, 'board:created', payload);
  const ws = board.workspaceId?.toString();
  if (ws) {
    emitToWorkspace(ws, 'board:created', payload);
  }
  emitToUser(board.ownerId.toString(), 'board:created', payload);
}

export function toBoardSummary(board: Document & IBoard): BoardSummaryDTO {
  const s = board.settings;
  return {
    id: board._id.toString(),
    ...(board.workspaceId ? { workspaceId: board.workspaceId.toString() } : {}),
    position: board.position,
    name: board.name,
    ...(board.description !== undefined ? { description: board.description } : {}),
    ...(board.background !== undefined ? { background: board.background } : {}),
    ...(board.themeSettings !== undefined ? { themeSettings: board.themeSettings } : {}),
    visibility: board.visibility,
    ownerId: board.ownerId.toString(),
    members: board.members.map((member) => ({
      userId: member.userId.toString(),
      roleKey: member.roleKey,
      addedAt: member.addedAt,
    })),
    settings: {
      allowComments: s.allowComments !== false,
      allowAttachments: s.allowAttachments !== false,
      cardCoverImages: s.cardCoverImages !== false,
      showRemindersOnCards: boardShowsRemindersOnCards(s),
      showStartDateOnCards: boardShowsStartDateOnCards(s),
      showDueDateOnCards: boardShowsDueDateOnCards(s),
      showEndDateOnCards: boardShowsEndDateOnCards(s),
      showLabels: s.showLabels !== false,
      showAssignees: s.showAssignees !== false,
      showChecklist: s.showChecklist !== false,
      showAttachments: s.showAttachments !== false,
      showComments: s.showComments !== false,
      showListCardCount: s.showListCardCount !== false,
      showCardDescriptionPreview: s.showCardDescriptionPreview !== false,
      ...(typeof s.listMaxCards === 'number' && !Number.isNaN(s.listMaxCards)
        ? { listMaxCards: s.listMaxCards }
        : {}),
      ...(s.listEnforceMaxCards !== undefined ? { listEnforceMaxCards: s.listEnforceMaxCards } : {}),
      ...(s.listColumnWidthAuto !== undefined ? { listColumnWidthAuto: s.listColumnWidthAuto } : {}),
      ...(typeof s.listColumnWidthPx === 'number' && !Number.isNaN(s.listColumnWidthPx)
        ? { listColumnWidthPx: s.listColumnWidthPx }
        : {}),
      ...(typeof s.memberActivityLogRetentionDays === 'number' &&
      !Number.isNaN(s.memberActivityLogRetentionDays)
        ? { memberActivityLogRetentionDays: s.memberActivityLogRetentionDays }
        : {}),
      ...(s.activityLogEnabled === true ? { activityLogEnabled: true } : {}),
      ...(typeof s.activityLogRetentionDays === 'number' && !Number.isNaN(s.activityLogRetentionDays)
        ? { activityLogRetentionDays: s.activityLogRetentionDays }
        : {}),
      ...(s.activityLogTracking != null && Object.keys(s.activityLogTracking).length > 0
        ? { activityLogTracking: { ...s.activityLogTracking } }
        : {}),
      ...(s.activityLogEmailRoundupEnabled === true
        ? { activityLogEmailRoundupEnabled: true }
        : {}),
      ...(Array.isArray(s.activityLogEmailRoundupUserIds) &&
      s.activityLogEmailRoundupUserIds.length > 0
        ? {
            activityLogEmailRoundupUserIds: s.activityLogEmailRoundupUserIds.map((id) =>
              id.toString(),
            ),
          }
        : {}),
    },
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

export async function resolveTargetDisplayNameForAudit(
  userId: string,
  hints?: BoardMemberAuditHints,
): Promise<string> {
  const fromHint = hints?.targetDisplayName?.trim();
  if (fromHint !== undefined && fromHint !== '') {
    return fromHint;
  }
  const user = await User.findById(userId).select('displayName').lean();
  return user?.displayName ?? 'Unknown user';
}

let boardLegacyPositionBackfillDone = false;

export async function ensureLegacyBoardPositions(): Promise<void> {
  if (boardLegacyPositionBackfillDone) {
    return;
  }
  boardLegacyPositionBackfillDone = true;
  const res = await Board.updateMany(
    { $or: [{ position: { $exists: false } }, { position: null }] },
    { $set: { position: 0 } },
  );
  if (res.modifiedCount > 0) {
    logger.info({ modifiedCount: res.modifiedCount }, 'Backfilled board.position for legacy documents');
  }
}

export async function emitWorkspaceTransitionsOnBoardMove(
  board: Document & IBoard,
  boardId: string,
  prevWorkspaceId: string | null,
  nextWorkspaceId: string | null,
): Promise<void> {
  const workspaceChanged = prevWorkspaceId !== nextWorkspaceId;
  if (!workspaceChanged) {
    return;
  }

  const affectedUserIds = (() => {
    const ids = [board.ownerId.toString(), ...board.members.map((m) => m.userId.toString())];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const trimmed = id.trim();
      if (trimmed !== '' && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    return out;
  })();

  // Change Streams will emit the update to the *new* workspaceId (if any). When workspace changes,
  // also notify the *previous* workspace room so home/workspace views update immediately.
  if (prevWorkspaceId) {
    const serverTs = Date.now();
    const payload = { boardId, data: board.toObject(), serverTs };
    emitToWorkspace(prevWorkspaceId, 'board:updated', payload);
  }

  if (nextWorkspaceId) {
    await Promise.all(
      affectedUserIds.map((uid) => emitWorkspaceHomeSnapshotToUserById(nextWorkspaceId, uid)),
    );
  }
  if (prevWorkspaceId) {
    await Promise.all(
      affectedUserIds.map((uid) => emitWorkspaceHomeAccessRefreshForUser(prevWorkspaceId, uid)),
    );
  }
}
