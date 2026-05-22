/**
 * Legacy import path: board import placeholders now live in {@link BoardImportPlaceholder}.
 * This module keeps migration + stable import names for callers.
 */
import mongoose, { type Types } from 'mongoose';
import { Board } from '../models/Board.js';
import { BoardImportPlaceholder } from '../models/BoardImportPlaceholder.js';
import { Card } from '../models/Card.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { extractRefUserIdString } from './boardService/helpers.js';
import {
  claimBoardImportPlaceholdersForUser,
  discardAllBoardImportPlaceholdersOnBoard,
  getOrCreateBoardImportPlaceholder,
  isBoardImportPlaceholderId,
} from './boardImportPlaceholderService.js';
import {
  isSyntheticImportPlaceholderEmail,
} from '../../shared/import/importPlaceholderDisplay.js';
import { normalizeImportSourceEmail } from '../../shared/import/importSourceUserContact.js';
import type { ImportPreflightUser } from '../../shared/import/importPreflight.js';

export {
  claimBoardImportPlaceholdersForUser as claimImportPlaceholderMembershipsForUser,
  discardAllBoardImportPlaceholdersOnBoard as discardAllUnmappedPlaceholdersOnBoard,
  getOrCreateBoardImportPlaceholder,
  isBoardImportPlaceholderId,
};

/** @deprecated Use getOrCreateBoardImportPlaceholder with boardId instead. */
export async function createImportPlaceholderUser(_params: {
  readonly source: 'trello' | 'wekan';
  readonly sourceUser: ImportPreflightUser;
}): Promise<string> {
  throw new Error('createImportPlaceholderUser requires boardId; use getOrCreateBoardImportPlaceholder');
}

export async function collectImportPlaceholderUserIdsOnBoards(
  boardIds: readonly Types.ObjectId[],
): Promise<string[]> {
  if (boardIds.length === 0) {
    return [];
  }
  const rows = await BoardImportPlaceholder.find({ boardId: { $in: boardIds } })
    .select('_id')
    .lean();
  return rows.map((r) => r._id.toString());
}

export async function cleanupImportPlaceholderUsersAfterBoardRemoval(
  candidateIds: readonly string[],
): Promise<number> {
  if (candidateIds.length === 0) {
    return 0;
  }
  const result = await BoardImportPlaceholder.deleteMany({
    _id: { $in: candidateIds.map((id) => new mongoose.Types.ObjectId(id)) },
  });
  return result.deletedCount ?? 0;
}

/**
 * Moves legacy `User` documents with `isPlaceholder: true` into `BoardImportPlaceholder` and deletes them.
 */
export async function migrateLegacyUserPlaceholdersToBoardCollection(): Promise<number> {
  const legacyUsers = await User.find({ isPlaceholder: true }).lean();
  if (legacyUsers.length === 0) {
    return 0;
  }

  let migrated = 0;
  for (const legacy of legacyUsers) {
    const legacyId = legacy._id.toString();
    const boards = await Board.find({ 'members.userId': legacy._id }).select('_id members').lean();

    for (const board of boards) {
      const member = board.members.find((m) => extractRefUserIdString(m.userId) === legacyId);
      const roleKey = member?.roleKey ?? 'viewer';
      const email =
        normalizeImportSourceEmail(legacy.placeholderEmail) ??
        normalizeImportSourceEmail(
          typeof legacy.email === 'string' && !isSyntheticImportPlaceholderEmail(legacy.email)
            ? legacy.email
            : undefined,
        );

      const existing = await BoardImportPlaceholder.findOne({
        boardId: board._id,
        sourceUserId: `legacy:${legacyId}`,
      })
        .select('_id')
        .lean();

      const placeholderId =
        existing?._id.toString() ??
        (
          await BoardImportPlaceholder.create({
            boardId: board._id,
            source: legacy.placeholderSource === 'trello' ? 'trello' : 'wekan',
            sourceUserId: `legacy:${legacyId}`,
            displayName: legacy.displayName,
            roleKey,
            ...(email != null ? { email } : {}),
            ...(typeof legacy.placeholderImportUsername === 'string' &&
            legacy.placeholderImportUsername.trim() !== ''
              ? { importUsername: legacy.placeholderImportUsername.trim().toLowerCase() }
              : {}),
          })
        )._id.toString();

      await Board.updateOne(
        { _id: board._id },
        { $pull: { members: { userId: legacy._id } } },
      );
      const cardsWithLegacy = await Card.find({ boardId: board._id, assignees: legacy._id })
        .select('_id assignees')
        .lean();
      for (const card of cardsWithLegacy) {
        const nextAssignees = (card.assignees ?? []).map((assigneeId) =>
          assigneeId.toString() === legacyId
            ? new mongoose.Types.ObjectId(placeholderId)
            : assigneeId,
        );
        await Card.updateOne({ _id: card._id }, { $set: { assignees: nextAssignees } });
      }
    }

    await User.findByIdAndDelete(legacyId);
    migrated += 1;
  }

  if (migrated > 0) {
    logger.info({ migrated }, 'Migrated legacy User import placeholders to BoardImportPlaceholder');
  }
  return migrated;
}

/**
 * Moves Wekan-style email-as-username values from `importUsername` into `email` for reliable Google login claim.
 */
export async function repairWekanEmailStoredInImportUsername(): Promise<number> {
  const rows = await BoardImportPlaceholder.find({
    importUsername: { $exists: true, $nin: [null, ''] },
  })
    .select('_id email importUsername')
    .lean();

  let repaired = 0;
  for (const row of rows) {
    const fromUsername = normalizeImportSourceEmail(row.importUsername);
    if (fromUsername == null) {
      continue;
    }
    const existingEmail =
      typeof row.email === 'string' && row.email.trim() !== '' ? row.email.trim().toLowerCase() : '';
    if (existingEmail === fromUsername) {
      await BoardImportPlaceholder.updateOne({ _id: row._id }, { $unset: { importUsername: '' } });
      repaired += 1;
      continue;
    }
    if (existingEmail !== '' && !isSyntheticImportPlaceholderEmail(existingEmail)) {
      continue;
    }
    await BoardImportPlaceholder.updateOne(
      { _id: row._id },
      { $set: { email: fromUsername }, $unset: { importUsername: '' } },
    );
    repaired += 1;
  }
  if (repaired > 0) {
    logger.info({ repaired }, 'Repaired Wekan email-as-username on board import placeholders');
  }
  return repaired;
}

/** Clears synthetic login emails mistakenly stored on board import placeholders. */
export async function sanitizeBoardImportPlaceholderStoredEmails(): Promise<number> {
  const rows = await BoardImportPlaceholder.find({
    email: { $regex: /@placeholder\.import\.local$/i },
  })
    .select('_id')
    .lean();
  if (rows.length === 0) {
    return 0;
  }
  await BoardImportPlaceholder.updateMany(
    { _id: { $in: rows.map((r) => r._id) } },
    { $unset: { email: '' } },
  );
  return rows.length;
}
