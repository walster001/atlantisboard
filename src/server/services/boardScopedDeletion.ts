import type { Types } from 'mongoose';
import { Activity } from '../models/Activity.js';
import { BoardLabel } from '../models/BoardLabel.js';
import { Card } from '../models/Card.js';
import { ImportJob } from '../models/ImportJob.js';
import { InviteLink } from '../models/InviteLink.js';
import { List } from '../models/List.js';
import { removeStoredAttachmentObjectsForBoardIds } from './attachmentService.js';
import { removeStoredImportInlineObjectsForBoardIds } from './importInlineAssetService.js';

/**
 * Deletes persisted data for the given boards: MinIO attachments, import-inline icons, cards, lists, board labels,
 * activity rows, and board-scoped invite links.
 *
 * Does not use the Notification model — notifications are not implemented in the app yet.
 */
export async function deleteAllMongoAndStorageForBoardIds(boardIds: Types.ObjectId[]): Promise<void> {
  if (boardIds.length === 0) {
    return;
  }

  await removeStoredAttachmentObjectsForBoardIds(boardIds);
  await removeStoredImportInlineObjectsForBoardIds(boardIds);
  await Card.deleteMany({ boardId: { $in: boardIds } });
  await List.deleteMany({ boardId: { $in: boardIds } });
  await BoardLabel.deleteMany({ boardId: { $in: boardIds } });
  await Activity.deleteMany({ boardId: { $in: boardIds } });
  await InviteLink.deleteMany({ boardId: { $in: boardIds } });
}

/**
 * Workspace-level MongoDB rows: workspace invites and import jobs referencing the workspace or its boards.
 */
export async function deleteWorkspaceScopedMongoRecords(
  workspaceId: Types.ObjectId,
  boardIds: Types.ObjectId[],
): Promise<void> {
  await InviteLink.deleteMany({ workspaceId });

  const orConditions: Array<Record<string, unknown>> = [{ 'result.workspaceId': workspaceId }];
  if (boardIds.length > 0) {
    orConditions.push({ 'result.boardId': { $in: boardIds } });
  }
  await ImportJob.deleteMany({ $or: orConditions });
}
