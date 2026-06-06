import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Board } from '../../../models/Board.js';
import { List } from '../../../models/List.js';
import { Card } from '../../../models/Card.js';
import { BoardLabel } from '../../../models/BoardLabel.js';
import { Workspace } from '../../../models/Workspace.js';
import { ImportJob } from '../../../models/ImportJob.js';
import type { ImportPreflightPayloadParsed } from '../../../../shared/import/importPreflightSchema.js';
import type { ImportPreflightUser } from '../../../../shared/import/importPreflight.js';
import { importPreflightUserFromTrelloMemberRecord } from '../../../../shared/import/importSourceUserContact.js';
import {
  ensureBoardImportPlaceholdersSeeded,
  extendSourceUsersById,
} from '../importSourceUserCatalog.js';
import {
  buildImportRealUserMap,
  isEligibleImportBoardMemberActorId,
  resolveImportActorId,
} from '../importUserMapService.js';
import {
  collectTrelloMemberIdsForBoard,
  mapTrelloBoardMemberToBoardRoleKey,
} from '../../../../shared/import/trelloBoardMemberRoles.js';
import { objectToRecord } from '../../../utils/objectRecord.js';
import { logger } from '../../../utils/logger.js';
import { createActivity } from '../../activityService.js';
import { emitToUser } from '../../../utils/socketIO.js';
import { normalizeTrelloExport } from '../../../../shared/import/trelloNormalize.js';
import { trelloColorKeyToHex, trelloLabelDisplayName } from '../../../../shared/import/trelloLabelColors.js';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
  CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
} from '../../../../shared/constants/entityTextLimits.js';
import { resolveTrelloBoardBackgroundForImport } from '../../../../shared/import/trelloBoardBackground.js';
import { spreadPosForIndex } from '../../../../shared/utils/cardListPos.js';
import { isHexCardColour, resolveImportedCardColour } from '../../../../shared/utils/importDefaultCardColour.js';
import {
  buildCardChecklists,
  buildChecklistsByCardId,
  resolveTrelloCoverImageUrl,
  trelloImportAttachmentMimeType,
} from './helpers.js';
import { cardDescriptionFields } from './cardFields.js';
import { createImportProgressTracker } from './progressTracker.js';
import { buildCardComments, resolveCommentUsersByEmail } from './cardComments.js';
import { resolveCardAssigneeIds, resolveCardLabels } from './cardImportTransforms.js';

const CARD_INSERT_BATCH = 80;

export async function executeTrelloImportJob(params: {
  readonly jsonData: unknown;
  readonly userId: string;
  readonly jobId: string;
  readonly targetWorkspaceId?: string;
  readonly defaultUncolouredCardColour?: string;
  readonly preflight?: ImportPreflightPayloadParsed;
}): Promise<void> {
  const { jsonData, userId, jobId, targetWorkspaceId, defaultUncolouredCardColour, preflight } = params;
  const data = normalizeTrelloExport(jsonData);
  const listsOrdered = [...data.lists].filter((l) => l.closed !== true).sort((a, b) => a.pos - b.pos);
  const cardsOrdered = [...data.cards]
    .filter((c) => c.closed !== true)
    .sort((a, b) => {
      if (a.idList !== b.idList) {
        return a.idList.localeCompare(b.idList);
      }
      return a.pos - b.pos;
    });
  const checklistsByCardId = buildChecklistsByCardId(data);

  const workspaceMap = new Map<string, string>();
  if (data.organizations) {
    for (const org of data.organizations) {
      const workspace = new Workspace({
        name: org.displayName || org.name,
        description: org.desc,
        ownerId: userId,
        visibility: 'private',
        members: [],
      });
      await workspace.save();
      workspaceMap.set(org.id, workspace._id.toString());
    }
  }

  let workspaceId = targetWorkspaceId;
  if (!workspaceId && data.organizations && data.organizations.length > 0) {
    workspaceId = workspaceMap.get(data.organizations[0].id);
  }
  if (!workspaceId) {
    const defaultWorkspace = new Workspace({
      name: 'Imported from Trello',
      ownerId: userId,
      visibility: 'private',
      members: [],
    });
    await defaultWorkspace.save();
    workspaceId = defaultWorkspace._id.toString();
  }

  const sourceUsers: ImportPreflightUser[] = (data.members ?? []).flatMap((member) => {
    const mapped = importPreflightUserFromTrelloMemberRecord(objectToRecord(member));
    return mapped != null ? [mapped] : [];
  });
  const realUserMap = await buildImportRealUserMap(sourceUsers);
  const unmappedPolicy = preflight?.unmappedUserPolicy ?? 'discard_unmapped';
  const boardActorMaps = new Map<string, Map<string, string>>();
  const memberIdByEmail = new Map<string, string>();
  for (const member of data.members ?? []) {
    if (member.email != null && member.email.trim() !== '' && realUserMap.has(member.id)) {
      memberIdByEmail.set(member.email.trim(), member.id);
    }
  }

  const boardMap = new Map<string, string>();
  const boardLabelMaps = new Map<string, Map<string, { id: string; name: string; color: string }>>();

  const boardIds = new Set(data.boards.map((b) => b.id));
  const labelTotal =
    data.labels == null
      ? 0
      : data.labels.filter((lab) => {
          if (lab.idBoard !== undefined) {
            return boardIds.has(lab.idBoard);
          }
          return data.boards.length === 1;
        }).length;

  const totalItems = data.boards.length + labelTotal + listsOrdered.length + cardsOrdered.length;
  const progressTracker = await createImportProgressTracker({ userId, jobId, totalItems });

  for (const trelloBoard of data.boards) {
    try {
      const orgId = trelloBoard.idOrganization;
      const boardWorkspaceId = orgId && workspaceMap.has(orgId) ? workspaceMap.get(orgId) : workspaceId;
      const rawBoardDesc =
        typeof trelloBoard.desc === 'string' && trelloBoard.desc.length > 0 ? trelloBoard.desc : undefined;
      const board = new Board({
        workspaceId: boardWorkspaceId,
        name: trelloBoard.name.slice(0, BOARD_NAME_MAX_LENGTH),
        description: rawBoardDesc !== undefined ? rawBoardDesc.slice(0, BOARD_DESCRIPTION_MAX_LENGTH) : undefined,
        background: resolveTrelloBoardBackgroundForImport(trelloBoard.prefs),
        visibility: 'workspace',
        ownerId: userId,
        members: [{ userId: new mongoose.Types.ObjectId(userId), roleKey: 'admin', addedAt: new Date() }],
        settings: { allowComments: true, allowAttachments: true, cardCoverImages: true },
      });
      await board.save();
      const atlBoardId = board._id.toString();
      boardMap.set(trelloBoard.id, atlBoardId);

      const trelloMemberIds = collectTrelloMemberIdsForBoard(trelloBoard.id, cardsOrdered);
      const boardSourceUsersById = extendSourceUsersById(sourceUsers, trelloMemberIds);
      const boardActorMap = new Map(realUserMap);
      await ensureBoardImportPlaceholdersSeeded({
        boardId: atlBoardId,
        sourceUsersById: boardSourceUsersById,
        referencedSourceUserIds: trelloMemberIds,
        actorMap: boardActorMap,
        source: 'trello',
        policy: unmappedPolicy,
        importerUserId: userId,
        preflight,
      });
      const seenMemberIds = new Set<string>([userId]);
      for (const trelloMemberId of trelloMemberIds) {
        const actorId = await resolveImportActorId({
          boardId: atlBoardId,
          sourceUserId: trelloMemberId,
          sourceUsersById: boardSourceUsersById,
          actorMap: boardActorMap,
          source: 'trello',
          roleKey: mapTrelloBoardMemberToBoardRoleKey(),
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
          roleKey: mapTrelloBoardMemberToBoardRoleKey(),
          addedAt: new Date(),
        });
      }
      if (board.members.length > 1) {
        await board.save();
      }
      boardActorMaps.set(trelloBoard.id, boardActorMap);

      const labelMap = new Map<string, { id: string; name: string; color: string }>();
      let labelsOnBoard = 0;
      if (data.labels) {
        const multiBoard = data.boards.length > 1;
        for (const trelloLabel of data.labels) {
          if (trelloLabel.idBoard !== undefined && trelloLabel.idBoard !== trelloBoard.id) {
            continue;
          }
          if (trelloLabel.idBoard === undefined && multiBoard) {
            continue;
          }
          const hex = trelloColorKeyToHex(trelloLabel.color ?? null);
          const displayName = trelloLabelDisplayName(trelloLabel.name, trelloLabel.color ?? null);
          const label = new BoardLabel({
            boardId: board._id,
            name: displayName,
            color: hex,
            isPredefined: false,
            createdBy: userId,
          });
          await label.save();
          labelMap.set(trelloLabel.id, { id: label._id.toString(), name: displayName, color: hex });
          labelsOnBoard++;
        }
      }
      boardLabelMaps.set(trelloBoard.id, labelMap);

      await progressTracker.markProcessed(1 + labelsOnBoard);
      await progressTracker.markPhase('labels');
    } catch (error) {
      logger.error({ error, boardId: trelloBoard.id }, 'Error importing Trello board');
      await progressTracker.markProcessed(1);
    }
  }

  const listMap = new Map<string, string>();
  const pendingLists: { trelloId: string; doc: { boardId: mongoose.Types.ObjectId; name: string; position: number } }[] = [];
  for (const trelloList of listsOrdered) {
    const bid = boardMap.get(trelloList.idBoard);
    if (!bid) {
      continue;
    }
    pendingLists.push({
      trelloId: trelloList.id,
      doc: {
        boardId: new mongoose.Types.ObjectId(bid),
        name: trelloList.name.slice(0, LIST_NAME_MAX_LENGTH),
        position: trelloList.pos / 10000,
      },
    });
  }
  if (pendingLists.length > 0) {
    const insertedLists = await List.insertMany(pendingLists.map((p) => p.doc), { ordered: true });
    pendingLists.forEach((p, idx) => {
      listMap.set(p.trelloId, insertedLists[idx]._id.toString());
    });
    await progressTracker.markProcessed(pendingLists.length);
    await progressTracker.markPhase('lists');
  }

  const cardsToImport = cardsOrdered.filter((c) => listMap.has(c.idList) && boardMap.has(c.idBoard));
  const trelloCardDensePosition = new Map<string, number>();
  {
    const counterByListId = new Map<string, number>();
    for (const c of cardsToImport) {
      const n = counterByListId.get(c.idList) ?? 0;
      trelloCardDensePosition.set(c.id, n);
      counterByListId.set(c.idList, n + 1);
    }
  }

  const commentUserByEmail = await resolveCommentUsersByEmail({
    cardsToImport,
    memberMap: realUserMap,
    memberIdByEmail,
  });

  for (let batchStart = 0; batchStart < cardsToImport.length; batchStart += CARD_INSERT_BATCH) {
    const chunk = cardsToImport.slice(batchStart, batchStart + CARD_INSERT_BATCH);
    const docs: Record<string, unknown>[] = [];
    for (const trelloCard of chunk) {
      const listIdStr = listMap.get(trelloCard.idList);
      const boardIdStr = boardMap.get(trelloCard.idBoard);
      if (listIdStr == null || boardIdStr == null) {
        continue;
      }

      const assigneeIds = resolveCardAssigneeIds(
        trelloCard,
        boardActorMaps.get(trelloCard.idBoard) ?? new Map<string, string>(),
      );
      const cardLabels = resolveCardLabels(trelloCard, boardLabelMaps.get(trelloCard.idBoard));

      const descStr = typeof trelloCard.desc === 'string' ? trelloCard.desc : undefined;
      const descFields = cardDescriptionFields(descStr);
      const coverObj =
        trelloCard.cover != null && typeof trelloCard.cover === 'object' && !Array.isArray(trelloCard.cover)
          ? (trelloCard.cover as Record<string, unknown>)
          : undefined;
      const coverUrl = resolveTrelloCoverImageUrl(coverObj, trelloCard.attachments);
      const rawCoverColor = coverObj != null && typeof coverObj.color === 'string' ? coverObj.color.trim() : '';
      const coverColorHex =
        rawCoverColor.length > 0
          ? isHexCardColour(rawCoverColor)
            ? rawCoverColor
            : trelloColorKeyToHex(rawCoverColor)
          : undefined;

      docs.push({
        listId: new mongoose.Types.ObjectId(listIdStr),
        boardId: new mongoose.Types.ObjectId(boardIdStr),
        title: trelloCard.name.slice(0, CARD_TITLE_MAX_LENGTH),
        description: descFields.description,
        descriptionHtml: '',
        descriptionPreview: descFields.descriptionPreview,
        descriptionCharCount: descFields.descriptionCharCount,
        position: trelloCardDensePosition.get(trelloCard.id) ?? 0,
        pos:
          typeof trelloCard.pos === 'number' && Number.isFinite(trelloCard.pos)
            ? trelloCard.pos
            : spreadPosForIndex(trelloCardDensePosition.get(trelloCard.id) ?? 0),
        color: resolveImportedCardColour(coverColorHex, defaultUncolouredCardColour),
        cover: coverUrl,
        labels: cardLabels,
        dueDate: trelloCard.due ? new Date(trelloCard.due) : undefined,
        startDate: trelloCard.start ? new Date(trelloCard.start) : undefined,
        completed: trelloCard.dueComplete ?? false,
        createdBy: new mongoose.Types.ObjectId(userId),
        assignees: assigneeIds,
        reminders: [],
        attachments:
          trelloCard.attachments?.map((att) => {
            const rawName = typeof att.name === 'string' ? att.name.trim() : '';
            const storedName =
              rawName.length > 0 ? rawName.slice(0, CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH) : 'attachment';
            return {
              id: crypto.randomUUID(),
              name: storedName,
              originalFileName: storedName,
              url: '',
              isPlaceholder: true,
              type: trelloImportAttachmentMimeType(att.mimeType),
              size: att.bytes ?? 0,
              uploadedAt: new Date(att.date),
              uploadedBy: new mongoose.Types.ObjectId(userId),
            };
          }) ?? [],
        comments: buildCardComments(trelloCard, commentUserByEmail, userId),
        checklists: buildCardChecklists(trelloCard, checklistsByCardId),
      });
    }

    if (docs.length > 0) {
      await Card.insertMany(docs, { ordered: true });
      await progressTracker.markProcessed(docs.length);
      await progressTracker.markPhase('cards');
    }
  }

  const primaryBoard = data.boards[0];
  const primaryBoardMongoId = primaryBoard != null ? boardMap.get(primaryBoard.id) : undefined;
  const importedCount = data.boards.length + labelTotal + listsOrdered.length + cardsToImport.length;
  const completionResult = {
    importedCount,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    ...(primaryBoardMongoId != null ? { boardId: new mongoose.Types.ObjectId(primaryBoardMongoId) } : {}),
    boardName: primaryBoard?.name.slice(0, BOARD_NAME_MAX_LENGTH),
    listCount: listsOrdered.length,
    cardCount: cardsToImport.length,
    labelCount: labelTotal,
  };

  if (primaryBoardMongoId != null) {
    createActivity({
      boardId: primaryBoardMongoId,
      userId,
      type: 'import.completed',
      description: `Trello import: ${cardsToImport.length} cards, ${listsOrdered.length} lists`,
    });
  }

  await ImportJob.findByIdAndUpdate(jobId, {
    status: 'completed',
    progress: 100,
    processedItems: totalItems,
    currentPhase: 'done',
    result: completionResult,
  });

  emitToUser(userId, 'import:completed', { jobId, result: completionResult });
  logger.info({ jobId, userId }, 'Trello import completed');
}
