import mongoose from 'mongoose';
import { Board } from '../../../models/Board.js';
import { List } from '../../../models/List.js';
import { Card } from '../../../models/Card.js';
import { BoardLabel } from '../../../models/BoardLabel.js';
import { Workspace } from '../../../models/Workspace.js';
import { ImportJob } from '../../../models/ImportJob.js';
import type { ImportPreflightUser } from '../../../../shared/import/importPreflight.js';
import { importPreflightUserFromWekanRecord } from '../../../../shared/import/importSourceUserContact.js';
import {
  collectWekanReferencedUserIdsForBoard,
  ensureBoardImportPlaceholdersSeeded,
  extendSourceUsersById,
} from '../importSourceUserCatalog.js';
import {
  buildImportRealUserMap,
  isEligibleImportBoardMemberActorId,
  resolveImportActorId,
} from '../importUserMapService.js';
import { logger } from '../../../utils/logger.js';
import { createActivity } from '../../activityService.js';
import { emitToUser } from '../../../utils/socketIO.js';
import { mapWekanBoardMemberToBoardRoleKey } from '../../../../shared/import/wekanBoardMemberRoleMap.js';
import { BOARD_DESCRIPTION_MAX_LENGTH, BOARD_NAME_MAX_LENGTH, LIST_NAME_MAX_LENGTH } from '../../../../shared/constants/entityTextLimits.js';
import type { ImportPreflightPayloadParsed } from '../../../../shared/import/importPreflightSchema.js';
import { normalizeImportedColour } from './helpers.js';
import { buildLocalizedInlineIconMap, extractLegacyInlineButtonCandidates, sanitizeImportedDescriptionText, sanitizeImportedPlainText } from './description.js';
import { buildWekanInlineButtonReplacementMap } from './inlineButtonReplacements.js';
import { normalizeWekanExport } from './normalization.js';
import { buildWekanCardInsertPlainObject, groupWekanRowsByCardId, WEKAN_CARD_INSERT_BATCH } from './cardPersistence.js';
import type { WekanCardInsertContext } from './types.js';

export async function executeWekanImportJob(params: {
  readonly jsonData: unknown;
  readonly userId: string;
  readonly jobId: string;
  readonly defaultUncolouredCardColour?: string;
  readonly preflight?: ImportPreflightPayloadParsed;
}): Promise<void> {
  const { jsonData, userId, jobId, defaultUncolouredCardColour, preflight } = params;
  const data = normalizeWekanExport(jsonData);
  const { replacementByIconSrc, skipLocalizationIconSrcs } = await buildWekanInlineButtonReplacementMap(
    preflight?.inlineButtonIconReplacements,
  );
  const inlineButtonImportColorOverrides = {
    ...(preflight?.inlineButtonImportColorOverrides?.textColor != null
      ? { textColor: preflight.inlineButtonImportColorOverrides.textColor }
      : {}),
    ...(preflight?.inlineButtonImportColorOverrides?.bgColor != null
      ? { bgColor: preflight.inlineButtonImportColorOverrides.bgColor }
      : {}),
  };
  const localizedByIconSrc = await buildLocalizedInlineIconMap(
    extractLegacyInlineButtonCandidates(data.cards),
    skipLocalizationIconSrcs,
  );

  if (data.boards.length === 0) {
    throw new Error('Wekan import: no boards found in file.');
  }

  const sourceUsers: ImportPreflightUser[] = (data.users ?? []).flatMap((wekanUser) => {
    const mapped = importPreflightUserFromWekanRecord(wekanUser as unknown as Record<string, unknown>);
    return mapped != null ? [mapped] : [];
  });
  const realUserMap = await buildImportRealUserMap(sourceUsers);
  const unmappedPolicy = preflight?.unmappedUserPolicy ?? 'discard_unmapped';
  const boardActorMaps = new Map<string, Map<string, string>>();

  const workspaceMap = new Map<string, string>();
  const boardMap = new Map<string, string>();
  const boardWipLimitMap = new Map<string, number>();
  for (const list of data.lists) {
    if (typeof list.wipLimit === 'number' && Number.isFinite(list.wipLimit) && list.wipLimit > 0) {
      const prev = boardWipLimitMap.get(list.boardId) ?? 0;
      boardWipLimitMap.set(list.boardId, Math.max(prev, Math.floor(list.wipLimit)));
    }
  }

  let processed = 0;
  let importedBoardCount = 0;
  let importedListCount = 0;
  let importedCardCount = 0;
  let lastEmittedProgress = 0;
  const totalItems = data.boards.length + data.lists.length + data.cards.length;
  await ImportJob.findByIdAndUpdate(jobId, { totalItems });

  for (const wekanBoard of data.boards) {
    try {
      const workspaceTitleBase = sanitizeImportedPlainText(wekanBoard.title) || `Imported from Wekan - ${wekanBoard._id}`;
      const workspaceDescriptionRaw =
        typeof wekanBoard.description === 'string' ? sanitizeImportedDescriptionText(wekanBoard.description) : '';
      const workspace = new Workspace({
        name: workspaceTitleBase.slice(0, 100),
        description: workspaceDescriptionRaw.length > 0 ? workspaceDescriptionRaw.slice(0, 500) : undefined,
        ownerId: userId,
        visibility: wekanBoard.permission === 'public' ? 'public' : 'private',
        members: [],
      });
      await workspace.save();
      workspaceMap.set(wekanBoard._id, workspace._id.toString());

      const sanitizedBoardName = sanitizeImportedPlainText(wekanBoard.title) || `Imported board ${wekanBoard._id}`;
      const rawWekanBoardDesc =
        typeof wekanBoard.description === 'string' && wekanBoard.description.length > 0
          ? sanitizeImportedDescriptionText(wekanBoard.description)
          : undefined;
      const board = new Board({
        workspaceId: workspace._id.toString(),
        name: sanitizedBoardName.slice(0, BOARD_NAME_MAX_LENGTH),
        description: rawWekanBoardDesc !== undefined ? rawWekanBoardDesc.slice(0, BOARD_DESCRIPTION_MAX_LENGTH) : undefined,
        background: wekanBoard.background,
        visibility: wekanBoard.permission === 'public' ? 'public' : 'workspace',
        ownerId: userId,
        members: [{ userId: new mongoose.Types.ObjectId(userId), roleKey: 'admin', addedAt: new Date() }],
        settings: {
          allowComments: true,
          allowAttachments: true,
          cardCoverImages: true,
          ...(boardWipLimitMap.get(wekanBoard._id) !== undefined
            ? { listMaxCards: boardWipLimitMap.get(wekanBoard._id), listEnforceMaxCards: true }
            : {}),
        },
      });
      await board.save();
      const atlBoardId = board._id.toString();
      boardMap.set(wekanBoard._id, atlBoardId);
      importedBoardCount++;

      const referencedUserIds = collectWekanReferencedUserIdsForBoard(data, wekanBoard._id);
      const boardSourceUsersById = extendSourceUsersById(sourceUsers, referencedUserIds);
      const boardActorMap = new Map(realUserMap);
      await ensureBoardImportPlaceholdersSeeded({
        boardId: atlBoardId,
        sourceUsersById: boardSourceUsersById,
        referencedSourceUserIds: referencedUserIds,
        actorMap: boardActorMap,
        source: 'wekan',
        policy: unmappedPolicy,
        importerUserId: userId,
        preflight,
      });
      const seenMemberIds = new Set<string>([userId]);
      for (const member of wekanBoard.members || []) {
        const roleKey = mapWekanBoardMemberToBoardRoleKey(member);
        const actorId = await resolveImportActorId({
          boardId: atlBoardId,
          sourceUserId: member.userId,
          sourceUsersById: boardSourceUsersById,
          actorMap: boardActorMap,
          source: 'wekan',
          roleKey,
          policy: unmappedPolicy,
          importerUserId: userId,
          preflight,
        });
        if (
          actorId == null ||
          seenMemberIds.has(actorId) ||
          !(await isEligibleImportBoardMemberActorId(actorId, unmappedPolicy))
        ) {
          continue;
        }
        seenMemberIds.add(actorId);
        board.members.push({
          userId: new mongoose.Types.ObjectId(actorId),
          roleKey,
          addedAt: new Date(),
        });
      }
      if (board.members.length > 1) {
        await board.save();
      }
      boardActorMaps.set(wekanBoard._id, boardActorMap);

      processed++;
      const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
      await ImportJob.findByIdAndUpdate(jobId, { progress, processedItems: processed });
      if (processed - lastEmittedProgress >= 10) {
        emitToUser(userId, 'import:progress', { jobId, progress, itemsProcessed: processed, totalItems });
        lastEmittedProgress = processed;
      }
    } catch (error) {
      logger.error({ error, boardId: wekanBoard._id }, 'Error importing Wekan board');
      processed++;
    }
  }

  const labelMap = new Map<string, { id: string; name: string; color: string }>();
  if (data.labels) {
    for (const wekanLabel of data.labels) {
      try {
        const boardId = boardMap.get(wekanLabel.boardId);
        if (!boardId) continue;
        const label = new BoardLabel({
          boardId,
          name: wekanLabel.name || 'Unnamed',
          color: normalizeImportedColour(wekanLabel.color) ?? '#61BD4F',
          isPredefined: false,
          createdBy: userId,
        });
        await label.save();
        labelMap.set(wekanLabel._id, { id: label._id.toString(), name: label.name, color: label.color });
      } catch (error) {
        logger.error({ error, labelId: wekanLabel._id }, 'Error importing Wekan label');
      }
    }
  }

  const listMap = new Map<string, string>();
  for (const wekanList of data.lists) {
    try {
      const boardId = boardMap.get(wekanList.boardId);
      if (!boardId) continue;
      const sanitizedListName = sanitizeImportedPlainText(wekanList.title) || 'Untitled list';
      const list = new List({
        boardId,
        name: sanitizedListName.slice(0, LIST_NAME_MAX_LENGTH),
        position: wekanList.sort || 0,
        ...(normalizeImportedColour(wekanList.color) !== undefined ? { color: normalizeImportedColour(wekanList.color) } : {}),
      });
      await list.save();
      listMap.set(wekanList._id, list._id.toString());
      importedListCount++;

      processed++;
      const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
      await ImportJob.findByIdAndUpdate(jobId, { progress, processedItems: processed });
      if (processed - lastEmittedProgress >= 10) {
        emitToUser(userId, 'import:progress', { jobId, progress, itemsProcessed: processed, totalItems });
        lastEmittedProgress = processed;
      }
    } catch (error) {
      logger.error({ error, listId: wekanList._id }, 'Error importing Wekan list');
      processed++;
    }
  }

  const checklistsByCardId = groupWekanRowsByCardId(data.checklists);
  const commentsByCardId = groupWekanRowsByCardId(data.comments);
  const attachmentsByCardId = groupWekanRowsByCardId(data.attachments);
  const cardInsertCtx: WekanCardInsertContext = {
    listMap,
    boardMap,
    boardActorMaps,
    labelMap,
    checklistsByCardId,
    commentsByCardId,
    attachmentsByCardId,
    replacementByIconSrc,
    localizedByIconSrc,
    inlineButtonImportColorOverrides,
    defaultUncolouredCardColour,
    userId,
  };

  const cardInsertBuffer: Record<string, unknown>[] = [];
  const flushCardInsertBuffer = async (): Promise<void> => {
    if (cardInsertBuffer.length === 0) {
      return;
    }
    const chunk = cardInsertBuffer.splice(0, WEKAN_CARD_INSERT_BATCH);
    await Card.insertMany(chunk, { ordered: true });
    importedCardCount += chunk.length;
  };

  for (const wekanCard of data.cards) {
    processed++;
    const doc = buildWekanCardInsertPlainObject(wekanCard, cardInsertCtx);
    if (doc != null) {
      cardInsertBuffer.push(doc);
    }
    while (cardInsertBuffer.length >= WEKAN_CARD_INSERT_BATCH) {
      await flushCardInsertBuffer();
    }
    const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
    await ImportJob.findByIdAndUpdate(jobId, {
      progress,
      processedItems: processed,
      currentPhase: 'cards',
    });
    if (processed - lastEmittedProgress >= 10) {
      emitToUser(userId, 'import:progress', {
        jobId,
        progress,
        itemsProcessed: processed,
        totalItems,
        phase: 'cards',
      });
      lastEmittedProgress = processed;
    }
  }
  while (cardInsertBuffer.length > 0) {
    await flushCardInsertBuffer();
  }

  const firstBoardForActivity = data.boards[0];
  const firstBoardIdForActivity = firstBoardForActivity != null ? boardMap.get(firstBoardForActivity._id) : undefined;
  if (firstBoardIdForActivity != null && importedCardCount > 0) {
    createActivity({
      boardId: firstBoardIdForActivity,
      userId,
      type: 'import.completed',
      description: `Wekan import: ${importedCardCount} cards, ${importedListCount} lists`,
      metadata: { source: 'wekan', jobId },
    });
  }

  const firstBoard = data.boards[0];
  const firstBoardId = firstBoard != null ? boardMap.get(firstBoard._id) : undefined;
  const firstWorkspaceId = firstBoard != null ? workspaceMap.get(firstBoard._id) : undefined;
  const completionResult = {
    message: 'Import completed successfully',
    importedCount: importedBoardCount + importedListCount + importedCardCount,
    boardCount: importedBoardCount,
    listCount: importedListCount,
    cardCount: importedCardCount,
    ...(firstWorkspaceId != null ? { workspaceId: new mongoose.Types.ObjectId(firstWorkspaceId) } : {}),
    ...(firstBoardId != null ? { boardId: new mongoose.Types.ObjectId(firstBoardId) } : {}),
    ...(firstBoard?.title != null ? { boardName: firstBoard.title.slice(0, BOARD_NAME_MAX_LENGTH) } : {}),
  };

  await ImportJob.findByIdAndUpdate(jobId, {
    status: 'completed',
    progress: 100,
    processedItems: totalItems,
    result: completionResult,
  });
  emitToUser(userId, 'import:completed', { jobId, result: completionResult });
  logger.info({ jobId, userId }, 'Wekan import completed');
}
