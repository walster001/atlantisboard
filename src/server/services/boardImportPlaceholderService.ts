import mongoose, { type Types } from 'mongoose';
import { Board } from '../models/Board.js';
import { BoardImportPlaceholder } from '../models/BoardImportPlaceholder.js';
import { Card } from '../models/Card.js';
import { logger } from '../utils/logger.js';
import { hasPermission } from '../utils/permissions.js';
import { buildBoardImportPlaceholderInsertFields } from '../../shared/import/boardImportPlaceholderInsert.js';
import {
  displayEmailForImportPlaceholderUser,
  isSyntheticImportPlaceholderEmail,
} from '../../shared/import/importPlaceholderDisplay.js';
import type { ImportPreflightUser } from '../../shared/import/importPreflight.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { createActivity } from './activityService.js';
import { extractRefUserIdString } from './boardService/helpers.js';
import {
  emitBoardDocumentToUser,
  emitBoardPermissionsUpdated,
  emitBoardUpdatedRealtime,
  resolveTargetDisplayNameForAudit,
} from './boardService/shared.js';
import { emitWorkspaceHomeSnapshotToUserById } from './workspaceService.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/domainErrors.js';

const PLACEHOLDER_INSERT_BATCH_SIZE = 500;

export interface BatchBoardImportPlaceholderEntry {
  readonly sourceUser: ImportPreflightUser;
  readonly roleKey: string;
}

function shouldUpgradePlaceholderEmail(existingEmail: string, nextEmail: string | undefined): boolean {
  return (
    nextEmail != null &&
    (existingEmail === '' || isSyntheticImportPlaceholderEmail(existingEmail))
  );
}

export interface BoardImportPlaceholderDirectoryRow {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly username: string;
  readonly roleKey: string;
}

export async function isBoardImportPlaceholderId(id: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return false;
  }
  return (await BoardImportPlaceholder.exists({ _id: id })) != null;
}

/**
 * Creates or reuses board import placeholders in bulk (one find + batched insertMany per board).
 */
export async function batchGetOrCreateBoardImportPlaceholders(params: {
  readonly boardId: string;
  readonly source: 'trello' | 'wekan';
  readonly entries: readonly BatchBoardImportPlaceholderEntry[];
}): Promise<Map<string, string>> {
  const { boardId, source, entries } = params;
  const result = new Map<string, string>();
  if (entries.length === 0) {
    return result;
  }

  const boardOid = new mongoose.Types.ObjectId(boardId);
  const uniqueEntries = new Map<string, BatchBoardImportPlaceholderEntry>();
  for (const entry of entries) {
    const sourceUserId = entry.sourceUser.sourceUserId.trim();
    if (sourceUserId === '') {
      continue;
    }
    if (!uniqueEntries.has(sourceUserId)) {
      uniqueEntries.set(sourceUserId, {
        sourceUser: { ...entry.sourceUser, sourceUserId },
        roleKey: entry.roleKey,
      });
    }
  }

  const sourceUserIds = [...uniqueEntries.keys()];
  if (sourceUserIds.length === 0) {
    return result;
  }

  const existingRows = await BoardImportPlaceholder.find({
    boardId: boardOid,
    sourceUserId: { $in: sourceUserIds },
  })
    .select('_id sourceUserId email')
    .lean();

  const emailUpgradeOps: Parameters<typeof BoardImportPlaceholder.bulkWrite>[0] = [];

  for (const row of existingRows) {
    const id = row._id.toString();
    result.set(row.sourceUserId, id);
    const entry = uniqueEntries.get(row.sourceUserId);
    if (entry == null) {
      continue;
    }
    const fields = buildBoardImportPlaceholderInsertFields(entry);
    const existingEmail =
      typeof row.email === 'string' && row.email.trim() !== '' ? row.email.trim() : '';
    if (shouldUpgradePlaceholderEmail(existingEmail, fields.email)) {
      emailUpgradeOps.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { email: fields.email! } },
        },
      });
    }
  }

  if (emailUpgradeOps.length > 0) {
    await BoardImportPlaceholder.bulkWrite(emailUpgradeOps, { ordered: false });
  }

  const missingIds = sourceUserIds.filter((id) => !result.has(id));
  if (missingIds.length === 0) {
    return result;
  }

  const insertDocs = missingIds.map((sourceUserId) => {
    const entry = uniqueEntries.get(sourceUserId);
    if (entry == null) {
      throw new Error(`Missing placeholder entry for ${sourceUserId}`);
    }
    const fields = buildBoardImportPlaceholderInsertFields(entry);
    return {
      boardId: boardOid,
      source,
      sourceUserId: fields.sourceUserId,
      displayName: fields.displayName,
      roleKey: fields.roleKey,
      ...(fields.email != null ? { email: fields.email } : {}),
      ...(fields.importUsername != null ? { importUsername: fields.importUsername } : {}),
    };
  });

  for (let offset = 0; offset < insertDocs.length; offset += PLACEHOLDER_INSERT_BATCH_SIZE) {
    const chunk = insertDocs.slice(offset, offset + PLACEHOLDER_INSERT_BATCH_SIZE);
    try {
      const inserted = await BoardImportPlaceholder.insertMany(chunk, { ordered: false });
      for (const doc of inserted) {
        result.set(doc.sourceUserId, doc._id.toString());
      }
    } catch (error: unknown) {
      const stillMissing = missingIds.filter((id) => !result.has(id));
      if (stillMissing.length === 0) {
        continue;
      }
      const refetched = await BoardImportPlaceholder.find({
        boardId: boardOid,
        sourceUserId: { $in: stillMissing },
      })
        .select('_id sourceUserId')
        .lean();
      for (const row of refetched) {
        result.set(row.sourceUserId, row._id.toString());
      }
      const unresolved = stillMissing.filter((id) => !result.has(id));
      if (unresolved.length > 0) {
        logger.error(
          { error, boardId, unresolvedCount: unresolved.length },
          'batchGetOrCreateBoardImportPlaceholders insert failed',
        );
        throw error;
      }
    }
  }

  return result;
}

export async function getOrCreateBoardImportPlaceholder(params: {
  readonly boardId: string;
  readonly source: 'trello' | 'wekan';
  readonly sourceUser: ImportPreflightUser;
  readonly roleKey: string;
}): Promise<string> {
  const map = await batchGetOrCreateBoardImportPlaceholders({
    boardId: params.boardId,
    source: params.source,
    entries: [{ sourceUser: params.sourceUser, roleKey: params.roleKey }],
  });
  const id = map.get(params.sourceUser.sourceUserId.trim());
  if (id == null) {
    throw new Error('Failed to create board import placeholder');
  }
  return id;
}

/** Board settings "All Users" can list every import placeholder on large Wekan boards. */
const BOARD_IMPORT_PLACEHOLDER_DIRECTORY_CAP = 2000;

export async function listBoardImportPlaceholderDirectoryRows(params: {
  readonly boardId: string;
  readonly query: string;
  readonly limit: number;
}): Promise<readonly BoardImportPlaceholderDirectoryRow[]> {
  const q = params.query.trim().toLowerCase();
  const filter: Record<string, unknown> = {
    boardId: new mongoose.Types.ObjectId(params.boardId),
  };
  if (q.length > 0) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ displayName: re }, { email: re }, { importUsername: re }];
  }
  const rowLimit =
    q.length === 0
      ? BOARD_IMPORT_PLACEHOLDER_DIRECTORY_CAP
      : Math.max(1, Math.min(params.limit, 120));
  const rows = await BoardImportPlaceholder.find(filter)
    .sort({ displayName: 1, _id: 1 })
    .limit(rowLimit)
    .lean();

  return rows.map((row) => ({
    _id: row._id.toString(),
    displayName: row.displayName,
    email: displayEmailForImportPlaceholderUser({
      placeholderEmail: row.email,
      accountEmail: '',
    }),
    username: row.importUsername ?? row.sourceUserId.slice(0, 24),
    roleKey: row.roleKey,
  }));
}

export async function listBoardImportPlaceholdersForDisplay(
  boardId: string,
): Promise<readonly BoardImportPlaceholderDirectoryRow[]> {
  return listBoardImportPlaceholderDirectoryRows({ boardId, query: '', limit: 120 });
}

export async function deleteBoardImportPlaceholdersForBoardIds(boardIds: readonly Types.ObjectId[]): Promise<void> {
  if (boardIds.length === 0) {
    return;
  }
  await BoardImportPlaceholder.deleteMany({ boardId: { $in: boardIds } });
}

async function claimPlaceholderOnBoard(
  boardId: string,
  placeholderId: string,
  realUserId: string,
  roleKey: string,
): Promise<void> {
  const board = await Board.findById(boardId);
  if (!board) {
    return;
  }
  const placeholderOid = new mongoose.Types.ObjectId(placeholderId);
  const realOid = new mongoose.Types.ObjectId(realUserId);
  const ownerId = extractRefUserIdString(board.ownerId);

  const members = board.members.filter((m) => extractRefUserIdString(m.userId) !== placeholderId);
  const realAlreadyMember = members.some((m) => extractRefUserIdString(m.userId) === realUserId);
  const addedViaPlaceholder = realUserId !== ownerId && !realAlreadyMember;
  if (addedViaPlaceholder) {
    members.push({
      userId: realOid,
      roleKey,
      addedAt: new Date(),
    });
  }
  board.members = members;
  await board.save();
  emitBoardUpdatedRealtime(board);

  if (addedViaPlaceholder) {
    emitBoardDocumentToUser(board, realUserId);
    const wsId = board.workspaceId?.toString();
    if (wsId) {
      void emitWorkspaceHomeSnapshotToUserById(wsId, realUserId);
    }
    emitBoardPermissionsUpdated(boardId, [realUserId], {
      reason: 'board.member.add',
      roleKey,
      viaPlaceholder: true,
    });

    const targetDisplayName = await resolveTargetDisplayNameForAudit(realUserId);
    logAuditEvent({
      userId: realUserId,
      action: 'board.member.add',
      resourceType: 'board',
      resourceId: boardId,
      metadata: { roleKey, viaPlaceholder: true },
      timestamp: new Date(),
    });
    createActivity({
      boardId,
      userId: realUserId,
      type: 'board.member.add',
      description: 'board.member.add',
      metadata: {
        targetUserId: realUserId,
        targetDisplayName,
        roleKey,
        viaPlaceholder: true,
      },
    });
  }

  const cards = await Card.find({ boardId, assignees: placeholderOid }).select('assignees').lean();
  for (const card of cards) {
    const assignees = (card.assignees ?? []).map((id) => id.toString());
    const withoutPlaceholder = assignees.filter((id) => id !== placeholderId);
    const next = withoutPlaceholder.includes(realUserId)
      ? withoutPlaceholder
      : [...withoutPlaceholder, realUserId];
    await Card.updateOne(
      { _id: card._id },
      { $set: { assignees: next.map((id) => new mongoose.Types.ObjectId(id)) } },
    );
  }

  await BoardImportPlaceholder.findByIdAndDelete(placeholderId);
}

/**
 * When a real user signs in, add them to boards that had import placeholders matching email/username.
 */
export async function claimBoardImportPlaceholdersForUser(user: {
  readonly _id: Types.ObjectId | string;
  readonly email: string;
  readonly username: string;
}): Promise<number> {
  const realUserId = user._id.toString();
  const emailNorm = user.email.trim().toLowerCase();
  const usernameNorm = user.username.trim().toLowerCase();
  const or: Record<string, unknown>[] = [];
  if (emailNorm.length > 0) {
    or.push({ email: emailNorm });
    // Wekan Google exports store the Gmail address in `username`; legacy rows may only have importUsername set.
    or.push({ importUsername: emailNorm });
  }
  if (usernameNorm.length >= 3) {
    or.push({ importUsername: usernameNorm });
  }
  if (or.length === 0) {
    return 0;
  }

  const placeholders = await BoardImportPlaceholder.find({ $or: or }).lean();
  let claimed = 0;
  for (const placeholder of placeholders) {
    const placeholderId = placeholder._id.toString();
    const boardId = placeholder.boardId.toString();
    await claimPlaceholderOnBoard(boardId, placeholderId, realUserId, placeholder.roleKey);
    claimed += 1;
    logger.info({ placeholderId, realUserId, boardId }, 'Board import placeholder claimed on login');
  }
  return claimed;
}

export async function discardAllBoardImportPlaceholdersOnBoard(
  boardId: string,
  actorUserId: string,
): Promise<{ readonly removedCount: number }> {
  const board = await Board.findById(boardId);
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  if (board.ownerId.toString() !== actorUserId) {
    const allowed = await hasPermission({ id: actorUserId }, boardId, 'boards.members.remove');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to discard placeholder users');
    }
  }

  const boardOid = new mongoose.Types.ObjectId(boardId);
  const placeholders = await BoardImportPlaceholder.find({ boardId: boardOid }).select('_id').lean();
  for (const placeholder of placeholders) {
    await Card.updateMany(
      { boardId: boardOid },
      { $pull: { assignees: placeholder._id } },
    );
  }
  const result = await BoardImportPlaceholder.deleteMany({ boardId: boardOid });
  const removedCount = result.deletedCount ?? 0;
  logger.info({ boardId, actorUserId, removedCount }, 'Discarded board import placeholder users');
  return { removedCount };
}
