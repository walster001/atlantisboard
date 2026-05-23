import type { Document } from 'mongoose';
import { Board, type IBoard } from '../../models/Board.js';
import { BoardLabel, type IBoardLabel } from '../../models/BoardLabel.js';
import { Card, type ICard } from '../../models/Card.js';
import { List, type IList } from '../../models/List.js';
import { User } from '../../models/User.js';
import { hasPermission } from '../../utils/permissions.js';
import {
  boardExportPermissionKey,
  LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY,
} from '../../../shared/export/boardExportPermissions.js';
import type { BoardExportFormat } from '../../../shared/export/boardExportFormats.js';

export interface BoardExportUserSummary {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
}

export interface BoardExportContext {
  readonly board: Document & IBoard;
  readonly lists: Array<Document & IList>;
  readonly cards: Array<Document & ICard>;
  readonly labels: Array<Document & IBoardLabel>;
  readonly usersById: ReadonlyMap<string, BoardExportUserSummary>;
}

async function loadUsersForExport(userIds: Iterable<string>): Promise<Map<string, BoardExportUserSummary>> {
  const unique = [...new Set([...userIds].filter((id) => id.trim() !== ''))];
  if (unique.length === 0) {
    return new Map();
  }
  const docs = await User.find({ _id: { $in: unique } })
    .select('email username displayName')
    .lean();
  const map = new Map<string, BoardExportUserSummary>();
  for (const doc of docs) {
    const id = doc._id.toString();
    map.set(id, {
      id,
      email: typeof doc.email === 'string' ? doc.email : '',
      username: typeof doc.username === 'string' ? doc.username : '',
      displayName: typeof doc.displayName === 'string' ? doc.displayName : '',
    });
  }
  return map;
}

async function assertBoardExportAllowed(
  userId: string,
  boardId: string,
  format: BoardExportFormat,
): Promise<void> {
  const specificKey = boardExportPermissionKey(format);
  if (await hasPermission({ id: userId }, boardId, specificKey)) {
    return;
  }
  if (
    format !== 'csv' &&
    (await hasPermission({ id: userId }, boardId, LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY))
  ) {
    return;
  }
  throw new Error('Access denied');
}

export async function loadBoardExportContext(
  boardId: string,
  userId: string,
  format: BoardExportFormat,
): Promise<BoardExportContext> {
  const board = await Board.findById(boardId);
  if (board == null) {
    throw new Error('Board not found');
  }

  const allowed = await hasPermission({ id: userId }, boardId, 'boards.view');
  if (!allowed) {
    throw new Error('Access denied');
  }
  await assertBoardExportAllowed(userId, boardId, format);

  const [lists, cards, labels] = await Promise.all([
    List.find({ boardId }).sort({ position: 1 }),
    Card.find({ boardId }).sort({ listId: 1, pos: 1, position: 1, _id: 1 }),
    BoardLabel.find({ boardId }),
  ]);

  const userIds = new Set<string>();
  userIds.add(board.ownerId.toString());
  for (const member of board.members) {
    userIds.add(member.userId.toString());
  }
  for (const card of cards) {
    for (const assigneeId of card.assignees) {
      userIds.add(assigneeId.toString());
    }
    for (const comment of card.comments) {
      userIds.add(comment.userId.toString());
    }
    for (const attachment of card.attachments) {
      userIds.add(attachment.uploadedBy.toString());
    }
  }

  const usersById = await loadUsersForExport(userIds);
  return { board, lists, cards, labels, usersById };
}

export function sanitizeBoardExportFilename(boardName: string, extension: string): string {
  const base = boardName
    .trim()
    .replace(/[^\w\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const safeBase = base.length > 0 ? base : 'board';
  return `${safeBase}.${extension}`;
}
