import mongoose from 'mongoose';
import { Board } from '../../models/Board.js';
import { List } from '../../models/List.js';
import { Card, type ICard } from '../../models/Card.js';
import { BoardLabel } from '../../models/BoardLabel.js';
import { Workspace } from '../../models/Workspace.js';
import { User } from '../../models/User.js';
import { ImportJob } from '../../models/ImportJob.js';
import { logger } from '../../utils/logger.js';
import { createActivity } from '../activityService.js';
import { deriveCardDescriptionPreview } from '../cardViewService.js';
import { emitToUser } from '../../utils/socketIO.js';
import { plainTextToCardDescriptionJson } from '../../../shared/utils/plainTextToCardDescriptionJson.js';
import { markdownToCardDescriptionJson } from '../../../shared/utils/markdownToCardDescriptionJson.js';
import {
  isHexCardColour,
  resolveImportedCardColour,
} from '../../../shared/utils/importDefaultCardColour.js';
import { normalizeTrelloExport } from '../../../shared/import/trelloNormalize.js';
import {
  trelloColorKeyToHex,
  trelloLabelDisplayName,
} from '../../../shared/import/trelloLabelColors.js';
import type {
  NormalizedTrelloExport,
  TrelloNormalizedCard,
  TrelloNormalizedChecklist,
} from '../../../shared/import/trelloNormalize.js';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
  CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
} from '../../../shared/constants/entityTextLimits.js';
import { resolveTrelloBoardBackgroundForImport } from '../../../shared/import/trelloBoardBackground.js';

const CARD_INSERT_BATCH = 80;

function trelloImportAttachmentMimeType(mime: string | null | undefined): string {
  const t = typeof mime === 'string' ? mime.trim() : '';
  return t.length > 0 ? t : 'application/octet-stream';
}

function buildChecklistsByCardId(
  data: NormalizedTrelloExport
): Map<string, TrelloNormalizedChecklist[]> {
  const map = new Map<string, TrelloNormalizedChecklist[]>();
  for (const cl of data.checklists) {
    const list = map.get(cl.idCard) ?? [];
    list.push(cl);
    map.set(cl.idCard, list);
  }
  return map;
}

function buildCardChecklists(
  trelloCard: TrelloNormalizedCard,
  checklistsByCardId: Map<string, TrelloNormalizedChecklist[]>
): ICard['checklists'] {
  const pool = checklistsByCardId.get(trelloCard.id) ?? [];
  const ids = trelloCard.idChecklists ?? [];
  const ordered: TrelloNormalizedChecklist[] =
    ids.length > 0
      ? ids
          .map((id) => pool.find((c) => c.id === id))
          .filter((c): c is TrelloNormalizedChecklist => c != null)
      : [...pool];

  const fromRoot: ICard['checklists'] = ordered.map((checklist) => ({
    id: crypto.randomUUID(),
    title: checklist.name,
    items: (checklist.checkItems ?? []).map((item, idx) => {
      const done = item.state === 'complete';
      const base = {
        id: crypto.randomUUID(),
        text: item.name.slice(0, 5000),
        completed: done,
        sortOrder: idx,
      };
      return done ? { ...base, completedAt: new Date() } : base;
    }),
  }));

  if (fromRoot.length > 0) {
    return fromRoot;
  }

  const legacy = trelloCard.checklists ?? [];
  return legacy.map((checklist) => ({
    id: crypto.randomUUID(),
    title: checklist.name,
    items: (checklist.checkItems ?? []).map((item, idx) => {
      const done = item.state === 'complete';
      const base = {
        id: crypto.randomUUID(),
        text: item.name.slice(0, 5000),
        completed: done,
        sortOrder: idx,
      };
      return done ? { ...base, completedAt: new Date() } : base;
    }),
  }));
}

function resolveTrelloCoverImageUrl(
  cover: Record<string, unknown> | undefined,
  attachments: TrelloNormalizedCard['attachments'] | undefined,
): string | undefined {
  if (cover == null) {
    return undefined;
  }
  for (const key of ['url', 'previewUrl'] as const) {
    const v = cover[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
  }
  const idAtt = cover.idAttachment;
  if (typeof idAtt === 'string' && attachments) {
    const att = attachments.find((a) => a.id === idAtt);
    if (att != null && typeof att.url === 'string' && att.url.trim().length > 0) {
      return att.url.trim();
    }
  }
  return undefined;
}

function cardDescriptionFields(desc: string | undefined): {
  description: string | undefined;
  descriptionPreview: string;
  descriptionCharCount: number;
} {
  if (desc == null || desc === '') {
    return { description: undefined, descriptionPreview: '', descriptionCharCount: 0 };
  }
  const description =
    markdownToCardDescriptionJson(desc) ?? plainTextToCardDescriptionJson(desc);
  const { preview, charCount } = deriveCardDescriptionPreview(description);
  return {
    description,
    descriptionPreview: preview,
    descriptionCharCount: charCount,
  };
}

export async function importTrello(
  jsonData: unknown,
  userId: string,
  targetWorkspaceId?: string,
  defaultUncolouredCardColour?: string,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const importJob = new ImportJob({
    userId,
    type: 'trello',
    status: 'processing',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
    importErrors: [],
    expiresAt,
  });

  await importJob.save();
  const jobId = importJob._id.toString();

  try {
    const data = normalizeTrelloExport(jsonData);
    // Match Trello UI: archived lists/cards stay in JSON but are hidden — do not import them.
    const listsOrdered = [...data.lists]
      .filter((l) => l.closed !== true)
      .sort((a, b) => a.pos - b.pos);
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

    const memberMap = new Map<string, string>();
    if (data.members) {
      for (const member of data.members) {
        if (member.email) {
          const user = await User.findOne({ email: member.email });
          if (user) {
            memberMap.set(member.id, user._id.toString());
          }
        }
      }
    }

    const boardMap = new Map<string, string>();
    const boardLabelMaps = new Map<
      string,
      Map<string, { id: string; name: string; color: string }>
    >();

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

    let processed = 0;
    let lastEmittedProgress = -1;
    const totalItems = data.boards.length + labelTotal + listsOrdered.length + cardsOrdered.length;

    const pushImportProgress = async (phase: string): Promise<void> => {
      const progress = totalItems > 0 ? Math.min(100, Math.round((processed / totalItems) * 100)) : 0;
      await ImportJob.findByIdAndUpdate(jobId, {
        progress,
        processedItems: processed,
        currentPhase: phase,
      });
      if (processed - lastEmittedProgress >= 8 || progress >= 100) {
        emitToUser(userId, 'import:progress', {
          jobId,
          progress,
          itemsProcessed: processed,
          totalItems,
          phase,
        });
        lastEmittedProgress = processed;
      }
    };

    await ImportJob.findByIdAndUpdate(jobId, {
      totalItems,
      currentPhase: 'boards',
    });

    for (const trelloBoard of data.boards) {
      try {
        const orgId = trelloBoard.idOrganization;
        const boardWorkspaceId =
          orgId && workspaceMap.has(orgId) ? workspaceMap.get(orgId) : workspaceId;

        const rawBoardDesc =
          typeof trelloBoard.desc === 'string' && trelloBoard.desc.length > 0 ? trelloBoard.desc : undefined;
        const board = new Board({
          workspaceId: boardWorkspaceId,
          name: trelloBoard.name.slice(0, BOARD_NAME_MAX_LENGTH),
          description:
            rawBoardDesc !== undefined
              ? rawBoardDesc.slice(0, BOARD_DESCRIPTION_MAX_LENGTH)
              : undefined,
          background: resolveTrelloBoardBackgroundForImport(trelloBoard.prefs),
          visibility: 'workspace',
          ownerId: userId,
          members: [],
          settings: {
            allowComments: true,
            allowAttachments: true,
            cardCoverImages: true,
          },
        });
        await board.save();
        boardMap.set(trelloBoard.id, board._id.toString());

        const labelMap = new Map<string, { id: string; name: string; color: string }>();
        let labelsOnBoard = 0;
        if (data.labels) {
          const multiBoard = data.boards.length > 1;
          for (const trelloLabel of data.labels) {
            if (
              trelloLabel.idBoard !== undefined &&
              trelloLabel.idBoard !== trelloBoard.id
            ) {
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
            labelMap.set(trelloLabel.id, {
              id: label._id.toString(),
              name: displayName,
              color: hex,
            });
            labelsOnBoard++;
          }
        }
        boardLabelMaps.set(trelloBoard.id, labelMap);

        processed += 1 + labelsOnBoard;
        await pushImportProgress('labels');
      } catch (error) {
        logger.error({ error, boardId: trelloBoard.id }, 'Error importing Trello board');
        processed += 1;
      }
    }

    const listMap = new Map<string, string>();
    const pendingLists: {
      trelloId: string;
      doc: { boardId: mongoose.Types.ObjectId; name: string; position: number };
    }[] = [];
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
    try {
      if (pendingLists.length > 0) {
        const insertedLists = await List.insertMany(pendingLists.map((p) => p.doc), { ordered: true });
        pendingLists.forEach((p, idx) => {
          listMap.set(p.trelloId, insertedLists[idx]._id.toString());
        });
        processed += pendingLists.length;
        await pushImportProgress('lists');
      }
    } catch (error) {
      logger.error({ error }, 'Error bulk-importing Trello lists');
      throw error;
    }

    const cardsToImport = cardsOrdered.filter(
      (c) => listMap.has(c.idList) && boardMap.has(c.idBoard),
    );

    const commentEmails = new Set<string>();
    for (const c of cardsToImport) {
      for (const co of c.comments ?? []) {
        const em = co.memberCreator.email;
        if (typeof em === 'string' && em.trim().length > 0) {
          commentEmails.add(em.trim());
        }
      }
    }
    const commentUserByEmail = new Map<string, mongoose.Types.ObjectId>();
    await Promise.all(
      [...commentEmails].map(async (email) => {
        const u = await User.findOne({ email });
        commentUserByEmail.set(
          email,
          (u?._id ?? new mongoose.Types.ObjectId(userId)) as mongoose.Types.ObjectId,
        );
      }),
    );

    const buildCardComments = (trelloCard: TrelloNormalizedCard): ICard['comments'] =>
      (trelloCard.comments ?? []).map((comment) => {
        const em = comment.memberCreator.email?.trim();
        const commentUserId =
          em != null && em.length > 0
            ? (commentUserByEmail.get(em) ?? new mongoose.Types.ObjectId(userId))
            : new mongoose.Types.ObjectId(userId);
        return {
          id: crypto.randomUUID(),
          userId: commentUserId,
          text: comment.data.text,
          createdAt: new Date(comment.date),
          updatedAt: new Date(comment.date),
        };
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

        const assigneeIds =
          trelloCard.idMembers
            ?.map((memberId) => {
              const mappedId = memberMap.get(memberId);
              return mappedId ? new mongoose.Types.ObjectId(mappedId) : null;
            })
            .filter((id): id is mongoose.Types.ObjectId => id !== null) ?? [];

        const labelMapForBoard = boardLabelMaps.get(trelloCard.idBoard);
        const labelIdList: string[] = [...(trelloCard.idLabels ?? [])];
        if (labelIdList.length === 0 && trelloCard.labels) {
          for (const l of trelloCard.labels) {
            labelIdList.push(l.id);
          }
        }
        const cardLabels: ICard['labels'] = [];
        for (const lid of labelIdList) {
          const meta = labelMapForBoard?.get(lid);
          if (meta) {
            cardLabels.push({
              id: meta.id,
              name: meta.name,
              color: meta.color,
            });
          }
        }

        const rawDesc = trelloCard.desc;
        const descStr = typeof rawDesc === 'string' ? rawDesc : undefined;
        const descFields = cardDescriptionFields(descStr);

        const coverObj =
          trelloCard.cover != null && typeof trelloCard.cover === 'object' && !Array.isArray(trelloCard.cover)
            ? (trelloCard.cover as Record<string, unknown>)
            : undefined;
        const coverUrl = resolveTrelloCoverImageUrl(coverObj, trelloCard.attachments);
        const rawCoverColor =
          coverObj != null && typeof coverObj.color === 'string' ? coverObj.color.trim() : '';
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
          position: trelloCard.pos / 10000,
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
                rawName.length > 0
                  ? rawName.slice(0, CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH)
                  : 'attachment';
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
          comments: buildCardComments(trelloCard),
          checklists: buildCardChecklists(trelloCard, checklistsByCardId),
        });
      }
      try {
        if (docs.length > 0) {
          await Card.insertMany(docs, { ordered: true });
          processed += docs.length;
          await pushImportProgress('cards');
        }
      } catch (error) {
        logger.error({ error, batchStart }, 'Error bulk-importing Trello cards');
        throw error;
      }
    }

    const primaryBoard = data.boards[0];
    const primaryBoardMongoId =
      primaryBoard != null ? boardMap.get(primaryBoard.id) : undefined;
    const importedCount = data.boards.length + labelTotal + listsOrdered.length + cardsToImport.length;
    const completionResult = {
      importedCount,
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      ...(primaryBoardMongoId != null
        ? { boardId: new mongoose.Types.ObjectId(primaryBoardMongoId) }
        : {}),
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

    emitToUser(userId, 'import:completed', {
      jobId,
      result: completionResult,
    });

    logger.info({ jobId, userId }, 'Trello import completed');
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Trello import failed');
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      importErrors: [
        {
          item: 'trello',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    });

    emitToUser(userId, 'import:error', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
