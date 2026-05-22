import mongoose, { type Types } from 'mongoose';
import { Board } from '../models/Board.js';
import { BoardImportPlaceholder } from '../models/BoardImportPlaceholder.js';
import { Card } from '../models/Card.js';
import { logger } from '../utils/logger.js';
import { hasPermission } from '../utils/permissions.js';
import {
  displayEmailForImportPlaceholderUser,
  isSyntheticImportPlaceholderEmail,
} from '../../shared/import/importPlaceholderDisplay.js';
import { normalizeImportSourceEmail } from '../../shared/import/importSourceUserContact.js';
import type { ImportPreflightUser } from '../../shared/import/importPreflight.js';
import { extractRefUserIdString } from './boardService/helpers.js';
import { emitBoardUpdatedRealtime } from './boardService/shared.js';

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

export async function getOrCreateBoardImportPlaceholder(params: {
  readonly boardId: string;
  readonly source: 'trello' | 'wekan';
  readonly sourceUser: ImportPreflightUser;
  readonly roleKey: string;
}): Promise<string> {
  const { boardId, source, sourceUser, roleKey } = params;
  const email = normalizeImportSourceEmail(sourceUser.email);
  const importUsername =
    sourceUser.username != null && sourceUser.username.trim().length >= 3
      ? sourceUser.username.trim().toLowerCase()
      : undefined;
  const displayName =
    sourceUser.fullName?.trim() ||
    sourceUser.username?.trim() ||
    email?.split('@')[0] ||
    `Imported user ${sourceUser.sourceUserId.slice(0, 8)}`;

  const existing = await BoardImportPlaceholder.findOne({
    boardId: new mongoose.Types.ObjectId(boardId),
    sourceUserId: sourceUser.sourceUserId,
  })
    .select('_id email')
    .lean();
  if (existing) {
    const existingEmail =
      typeof existing.email === 'string' && existing.email.trim() !== '' ? existing.email.trim() : '';
    const shouldSetEmail =
      email != null &&
      (existingEmail === '' || isSyntheticImportPlaceholderEmail(existingEmail));
    if (shouldSetEmail) {
      await BoardImportPlaceholder.updateOne({ _id: existing._id }, { $set: { email } });
    }
    return existing._id.toString();
  }

  const doc = await BoardImportPlaceholder.create({
    boardId: new mongoose.Types.ObjectId(boardId),
    source,
    sourceUserId: sourceUser.sourceUserId,
    displayName: displayName.slice(0, 100),
    roleKey,
    ...(email != null ? { email } : {}),
    ...(importUsername != null ? { importUsername } : {}),
  });
  return doc._id.toString();
}

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
  const rows = await BoardImportPlaceholder.find(filter)
    .sort({ displayName: 1, _id: 1 })
    .limit(Math.max(1, Math.min(params.limit, 120)))
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
  if (realUserId !== ownerId && !realAlreadyMember) {
    members.push({
      userId: realOid,
      roleKey,
      addedAt: new Date(),
    });
  }
  board.members = members;
  await board.save();
  emitBoardUpdatedRealtime(board);

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
    throw new Error('Board not found');
  }

  if (board.ownerId.toString() !== actorUserId) {
    const allowed = await hasPermission({ id: actorUserId }, boardId, 'boards.members.remove');
    if (!allowed) {
      throw new Error('Insufficient permissions to discard placeholder users');
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
