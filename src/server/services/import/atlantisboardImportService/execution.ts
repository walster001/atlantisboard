import mongoose from 'mongoose';
import { Board } from '../../../models/Board.js';
import { BoardLabel } from '../../../models/BoardLabel.js';
import { Card } from '../../../models/Card.js';
import { ImportJob } from '../../../models/ImportJob.js';
import { List } from '../../../models/List.js';
import { User } from '../../../models/User.js';
import { Workspace } from '../../../models/Workspace.js';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
} from '../../../../shared/constants/entityTextLimits.js';
import {
  atlantisboardImportToDate,
  normalizeAtlantisboardExport,
} from '../../../../shared/import/atlantisboardNormalize.js';
import { createActivity } from '../../activityService.js';
import { createImportProgressTracker } from '../trelloImportService/progressTracker.js';
import { emitToUser } from '../../../utils/socketIO.js';
import { logger } from '../../../utils/logger.js';
import { materializeAtlantisboardAttachments } from './attachments.js';

const CARD_INSERT_BATCH = 40;

async function resolveExistingUserObjectId(
  candidateId: string | undefined,
  fallbackUserId: string,
): Promise<mongoose.Types.ObjectId> {
  const trimmed = candidateId?.trim() ?? '';
  if (trimmed !== '' && mongoose.Types.ObjectId.isValid(trimmed)) {
    const exists = await User.exists({ _id: trimmed });
    if (exists != null) {
      return new mongoose.Types.ObjectId(trimmed);
    }
  }
  return new mongoose.Types.ObjectId(fallbackUserId);
}

function mergeBoardSettings(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  const defaults = {
    allowComments: true,
    allowAttachments: true,
    cardCoverImages: true,
    showDueDateAndReminders: true,
    showRemindersOnCards: true,
    showStartDateOnCards: true,
    showDueDateOnCards: true,
    showEndDateOnCards: true,
    showLabels: true,
    showAssignees: true,
    showChecklist: true,
    showAttachments: true,
    showComments: true,
    showListCardCount: true,
    showCardDescriptionPreview: true,
  };
  if (raw == null) {
    return defaults;
  }
  return { ...defaults, ...raw };
}

export async function executeAtlantisboardImportJob(params: {
  readonly jsonData: unknown;
  readonly userId: string;
  readonly jobId: string;
  readonly targetWorkspaceId?: string;
}): Promise<void> {
  const { jsonData, userId, jobId, targetWorkspaceId } = params;
  const data = normalizeAtlantisboardExport(jsonData);

  let workspaceId = targetWorkspaceId;
  if (workspaceId == null || workspaceId.trim() === '') {
    const defaultWorkspace = new Workspace({
      name: 'Imported from Atlantisboard',
      ownerId: userId,
      visibility: 'private',
      members: [],
    });
    await defaultWorkspace.save();
    workspaceId = defaultWorkspace._id.toString();
  }

  const listsOrdered = [...data.lists].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
  );
  const cardsOrdered = [...data.cards].sort((a, b) => {
    if (a.listId !== b.listId) {
      return a.listId.localeCompare(b.listId);
    }
    const ap = a.pos ?? a.position ?? 0;
    const bp = b.pos ?? b.position ?? 0;
    return ap - bp;
  });

  const totalItems = 1 + data.labels.length + listsOrdered.length + cardsOrdered.length;
  const progressTracker = await createImportProgressTracker({ userId, jobId, totalItems });

  const importerOid = new mongoose.Types.ObjectId(userId);
  const members: Array<{ userId: mongoose.Types.ObjectId; roleKey: string; addedAt: Date }> = [
    { userId: importerOid, roleKey: 'admin', addedAt: new Date() },
  ];
  const seenMemberIds = new Set<string>([userId]);
  for (const member of data.board.members) {
    const resolvedId = await resolveExistingUserObjectId(member.userId, userId);
    const resolvedKey = resolvedId.toString();
    if (seenMemberIds.has(resolvedKey)) {
      continue;
    }
    seenMemberIds.add(resolvedKey);
    members.push({
      userId: resolvedId,
      roleKey: member.roleKey.trim() || 'viewer',
      addedAt: atlantisboardImportToDate(member.addedAt) ?? new Date(),
    });
  }

  const board = new Board({
    workspaceId,
    name: data.board.name.slice(0, BOARD_NAME_MAX_LENGTH),
    ...(data.board.description != null && data.board.description.trim() !== ''
      ? { description: data.board.description.slice(0, BOARD_DESCRIPTION_MAX_LENGTH) }
      : {}),
    ...(data.board.background != null && data.board.background.trim() !== ''
      ? { background: data.board.background.trim() }
      : {}),
    visibility: data.board.visibility ?? 'workspace',
    ownerId: userId,
    members,
    settings: mergeBoardSettings(data.board.settings),
  });
  await board.save();
  const boardOid = board._id;
  const boardId = boardOid.toString();

  const labelMap = new Map<string, { id: string; name: string; color: string }>();
  for (const label of data.labels) {
    const boardLabel = new BoardLabel({
      boardId: boardOid,
      name: label.name.slice(0, 50),
      color: label.color,
      isPredefined: label.isPredefined === true,
      createdBy: userId,
    });
    await boardLabel.save();
    labelMap.set(label.id, {
      id: boardLabel._id.toString(),
      name: boardLabel.name,
      color: boardLabel.color,
    });
  }
  await progressTracker.markProcessed(1 + data.labels.length);
  await progressTracker.markPhase('labels');

  const listMap = new Map<string, string>();
  for (const [index, list] of listsOrdered.entries()) {
    const listDoc = new List({
      boardId: boardOid,
      name: list.name.slice(0, LIST_NAME_MAX_LENGTH),
      position: typeof list.position === 'number' ? list.position : index,
      ...(list.color != null && list.color.trim() !== '' ? { color: list.color.trim() } : {}),
    });
    await listDoc.save();
    listMap.set(list.id, listDoc._id.toString());
  }
  await progressTracker.markProcessed(listsOrdered.length);
  await progressTracker.markPhase('lists');

  let importedCardCount = 0;
  for (let offset = 0; offset < cardsOrdered.length; offset += CARD_INSERT_BATCH) {
    const chunk = cardsOrdered.slice(offset, offset + CARD_INSERT_BATCH);
    const docs: Record<string, unknown>[] = [];
    for (const exportedCard of chunk) {
      const listId = listMap.get(exportedCard.listId);
      if (listId == null) {
        continue;
      }
      const cardOid = new mongoose.Types.ObjectId();
      const cardId = cardOid.toString();
      const attachments = await materializeAtlantisboardAttachments({
        cardId,
        userId,
        attachments: exportedCard.attachments,
      });

      const cardLabels = exportedCard.labels
        .map((label) => labelMap.get(label.id) ?? label)
        .map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color,
        }));

      const assignees: mongoose.Types.ObjectId[] = [];
      for (const assigneeId of exportedCard.assignees) {
        assignees.push(await resolveExistingUserObjectId(assigneeId, userId));
      }

      const comments = await Promise.all(
        exportedCard.comments.map(async (comment) => ({
          id: comment.id,
          userId: await resolveExistingUserObjectId(comment.userId, userId),
          text: comment.text,
          createdAt: atlantisboardImportToDate(comment.createdAt) ?? new Date(),
          updatedAt: atlantisboardImportToDate(comment.updatedAt) ?? atlantisboardImportToDate(comment.createdAt) ?? new Date(),
        })),
      );

      docs.push({
        _id: cardOid,
        listId: new mongoose.Types.ObjectId(listId),
        boardId: boardOid,
        title: exportedCard.title.slice(0, CARD_TITLE_MAX_LENGTH),
        ...(exportedCard.description != null && exportedCard.description !== ''
          ? { description: exportedCard.description }
          : {}),
        ...(exportedCard.descriptionHtml != null ? { descriptionHtml: exportedCard.descriptionHtml } : {}),
        descriptionPreview: exportedCard.descriptionPreview ?? '',
        descriptionCharCount: exportedCard.descriptionCharCount ?? 0,
        position: exportedCard.position ?? 0,
        ...(typeof exportedCard.pos === 'number' ? { pos: exportedCard.pos } : {}),
        ...(exportedCard.color != null && exportedCard.color.trim() !== ''
          ? { color: exportedCard.color.trim() }
          : {}),
        ...(exportedCard.cover != null && exportedCard.cover.trim() !== ''
          ? { cover: exportedCard.cover.trim() }
          : {}),
        labels: cardLabels,
        ...(atlantisboardImportToDate(exportedCard.dueDate) != null
          ? { dueDate: atlantisboardImportToDate(exportedCard.dueDate) }
          : {}),
        ...(atlantisboardImportToDate(exportedCard.startDate) != null
          ? { startDate: atlantisboardImportToDate(exportedCard.startDate) }
          : {}),
        ...(atlantisboardImportToDate(exportedCard.endDate) != null
          ? { endDate: atlantisboardImportToDate(exportedCard.endDate) }
          : {}),
        completed: exportedCard.completed === true,
        ...(atlantisboardImportToDate(exportedCard.completedAt) != null
          ? { completedAt: atlantisboardImportToDate(exportedCard.completedAt) }
          : {}),
        createdBy: await resolveExistingUserObjectId(exportedCard.createdBy, userId),
        assignees,
        reminders: exportedCard.reminders,
        checklists: exportedCard.checklists.map((checklist) => ({
          id: checklist.id,
          title: checklist.title,
          items: checklist.items.map((item) => ({
            id: item.id,
            text: item.text,
            completed: item.completed === true,
            ...(atlantisboardImportToDate(item.completedAt) != null
              ? { completedAt: atlantisboardImportToDate(item.completedAt) }
              : {}),
            ...(typeof item.sortOrder === 'number' ? { sortOrder: item.sortOrder } : {}),
          })),
        })),
        comments,
        attachments,
        ...(atlantisboardImportToDate(exportedCard.createdAt) != null
          ? { createdAt: atlantisboardImportToDate(exportedCard.createdAt) }
          : {}),
        ...(atlantisboardImportToDate(exportedCard.updatedAt) != null
          ? { updatedAt: atlantisboardImportToDate(exportedCard.updatedAt) }
          : {}),
      });
    }
    if (docs.length > 0) {
      await Card.insertMany(docs, { ordered: true });
      importedCardCount += docs.length;
    }
    await progressTracker.markProcessed(chunk.length);
    await progressTracker.markPhase('cards');
  }

  createActivity({
    boardId,
    userId,
    type: 'import.completed',
    description: `Atlantisboard import: ${importedCardCount} cards, ${listsOrdered.length} lists`,
    metadata: { source: 'atlantisboard', jobId },
  });

  const completionResult = {
    importedCount: 1 + data.labels.length + listsOrdered.length + importedCardCount,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    boardId: boardOid,
    boardName: data.board.name.slice(0, BOARD_NAME_MAX_LENGTH),
    listCount: listsOrdered.length,
    cardCount: importedCardCount,
    labelCount: data.labels.length,
  };

  await ImportJob.findByIdAndUpdate(jobId, {
    status: 'completed',
    progress: 100,
    processedItems: totalItems,
    currentPhase: 'done',
    result: completionResult,
  });
  emitToUser(userId, 'import:completed', { jobId, result: completionResult });
  logger.info({ jobId, userId, boardId }, 'Atlantisboard import completed');
}
