import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Board } from '../models/Board.js';
import { Card } from '../models/Card.js';
import { User, type IUser } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { extractRefUserIdString } from './boardService/helpers.js';
import type { ImportPreflightUser } from '../../shared/import/importPreflight.js';

const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.import.local';

function normalizeEmail(value: string | undefined): string | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : undefined;
}

function sanitizeUsernameBase(value: string): string {
  const base = value.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return base.length >= 3 ? base.slice(0, 40) : '';
}

async function reserveUniqueUsername(base: string): Promise<string> {
  const root = base.length >= 3 ? base : `imp_${crypto.randomBytes(4).toString('hex')}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root.slice(0, 50) : `${root.slice(0, 42)}_${attempt}`;
    const exists = await User.exists({ username: candidate });
    if (!exists) {
      return candidate;
    }
  }
  return `imp_${crypto.randomBytes(8).toString('hex')}`;
}

async function reserveUniqueEmail(preferred: string | undefined, source: string, sourceUserId: string): Promise<string> {
  if (preferred != null) {
    const taken = await User.exists({ email: preferred });
    if (!taken) {
      return preferred;
    }
  }
  const slug = sourceUserId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 48) || crypto.randomBytes(6).toString('hex');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate =
      attempt === 0
        ? `import+${source}+${slug}@${PLACEHOLDER_EMAIL_DOMAIN}`
        : `import+${source}+${slug}+${attempt}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    const taken = await User.exists({ email: candidate });
    if (!taken) {
      return candidate;
    }
  }
  return `import+${source}+${crypto.randomBytes(10).toString('hex')}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/**
 * Creates a board-import placeholder user for an unmapped Wekan/Trello identity.
 */
export async function createImportPlaceholderUser(params: {
  readonly source: 'trello' | 'wekan';
  readonly sourceUser: ImportPreflightUser;
}): Promise<string> {
  const { source, sourceUser } = params;
  const placeholderEmail = normalizeEmail(sourceUser.email);
  const importUsername = sourceUser.username?.trim();
  const displayName =
    sourceUser.fullName?.trim() ||
    importUsername ||
    placeholderEmail?.split('@')[0] ||
    `Imported user ${sourceUser.sourceUserId.slice(0, 8)}`;

  const email = await reserveUniqueEmail(placeholderEmail, source, sourceUser.sourceUserId);
  const usernameBase =
    sanitizeUsernameBase(importUsername ?? '') ||
    sanitizeUsernameBase(sourceUser.sourceUserId) ||
    `imp_${source}`;
  const username = await reserveUniqueUsername(usernameBase);

  const user = new User({
    email,
    username,
    displayName: displayName.slice(0, 100),
    isPlaceholder: true,
    placeholderSource: source,
    ...(placeholderEmail != null ? { placeholderEmail } : {}),
    placeholderName: displayName.slice(0, 100),
    ...(importUsername != null && importUsername.length >= 3
      ? { placeholderImportUsername: importUsername.toLowerCase() }
      : {}),
    emailVerified: false,
    failedLoginAttempts: 0,
  });
  await user.save();
  return user._id.toString();
}

function buildPlaceholderMatchFilter(email: string, username: string): Record<string, unknown> {
  const emailNorm = email.trim().toLowerCase();
  const usernameNorm = username.trim().toLowerCase();
  const or: Record<string, unknown>[] = [];
  if (emailNorm.length > 0) {
    or.push({ placeholderEmail: emailNorm }, { email: emailNorm });
  }
  if (usernameNorm.length >= 3) {
    or.push({ placeholderImportUsername: usernameNorm });
  }
  return {
    isPlaceholder: true,
    ...(or.length > 0 ? { $or: or } : {}),
  };
}

async function reassignPlaceholderBoardMembership(
  boardId: string,
  placeholderUserId: string,
  realUserId: string,
  roleKey: string,
): Promise<void> {
  const board = await Board.findById(boardId);
  if (!board) {
    return;
  }
  const placeholderOid = new mongoose.Types.ObjectId(placeholderUserId);
  const realOid = new mongoose.Types.ObjectId(realUserId);
  const ownerId = extractRefUserIdString(board.ownerId);

  const members = board.members.filter((m) => extractRefUserIdString(m.userId) !== placeholderUserId);
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

  const cards = await Card.find({ boardId, assignees: placeholderOid }).select('assignees').lean();
  for (const card of cards) {
    const assignees = (card.assignees ?? []).map((id) => id.toString());
    const withoutPlaceholder = assignees.filter((id) => id !== placeholderUserId);
    const next = withoutPlaceholder.includes(realUserId)
      ? withoutPlaceholder
      : [...withoutPlaceholder, realUserId];
    await Card.updateOne({ _id: card._id }, { $set: { assignees: next.map((id) => new mongoose.Types.ObjectId(id)) } });
  }
}

/**
 * When a real user signs in, attach them to boards that had import placeholders matching their email/username,
 * then remove those placeholder accounts.
 */
export async function claimImportPlaceholderMembershipsForUser(user: Pick<IUser, '_id' | 'email' | 'username'>): Promise<number> {
  const realUserId = user._id.toString();
  const filter = buildPlaceholderMatchFilter(user.email, user.username);
  if (!('$or' in filter)) {
    return 0;
  }

  const placeholders = await User.find(filter).select('_id').lean();
  if (placeholders.length === 0) {
    return 0;
  }

  let claimed = 0;
  for (const placeholder of placeholders) {
    const placeholderUserId = placeholder._id.toString();
    if (placeholderUserId === realUserId) {
      continue;
    }

    const boards = await Board.find({ 'members.userId': new mongoose.Types.ObjectId(placeholderUserId) })
      .select('_id members')
      .lean();

    for (const board of boards) {
      const boardId = board._id.toString();
      const entry = board.members.find((m) => extractRefUserIdString(m.userId) === placeholderUserId);
      const roleKey = entry?.roleKey ?? 'viewer';
      await reassignPlaceholderBoardMembership(boardId, placeholderUserId, realUserId, roleKey);
    }

    await User.findByIdAndDelete(placeholderUserId);
    claimed += 1;
    logger.info(
      { placeholderUserId, realUserId, boardCount: boards.length },
      'Import placeholder claimed on login',
    );
  }

  return claimed;
}
