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
import { emitToUser } from '../../utils/socketIO.js';
import { plainTextToCardDescriptionJson } from '../../../shared/utils/plainTextToCardDescriptionJson.js';

interface TrelloOrganization {
  id: string;
  name: string;
  displayName: string;
  desc?: string;
}

interface TrelloBoard {
  id: string;
  name: string;
  desc?: string;
  closed: boolean;
  idOrganization?: string;
  prefs?: {
    background?: string;
  };
}

interface TrelloList {
  id: string;
  name: string;
  idBoard: string;
  pos: number;
  closed: boolean;
}

interface TrelloCard {
  id: string;
  name: string;
  desc?: string;
  idList: string;
  pos: number;
  closed: boolean;
  due?: string;
  dueComplete?: boolean;
  cover?: {
    color?: string;
    url?: string;
  };
  idLabels?: string[];
  idMembers?: string[];
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    mimeType: string;
    bytes?: number;
    date: string;
  }>;
  checklists?: Array<{
    id: string;
    name: string;
    checkItems: Array<{
      id: string;
      name: string;
      state: 'complete' | 'incomplete';
      due?: string;
    }>;
  }>;
  comments?: Array<{
    id: string;
    data: {
      text: string;
    };
    memberCreator: {
      email?: string;
      fullName?: string;
    };
    date: string;
  }>;
}

interface TrelloLabel {
  id: string;
  name: string;
  color?: string;
}

interface TrelloMember {
  id: string;
  email?: string;
  username?: string;
  fullName?: string;
}

interface TrelloExport {
  organizations?: TrelloOrganization[];
  boards: TrelloBoard[];
  lists: TrelloList[];
  cards: TrelloCard[];
  labels?: TrelloLabel[];
  members?: TrelloMember[];
}

export async function importTrello(
  jsonData: TrelloExport,
  userId: string,
  targetWorkspaceId?: string
): Promise<string> {
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days, matches ImportJob TTL
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
    // Parse JSON (already parsed if passed as object)
    const data = jsonData;

    // Map organizations to workspaces
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

    // Use target workspace or create default
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

    // Map members to users (by email)
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

    // Import boards
    const boardMap = new Map<string, string>();
    let processed = 0;
    let lastEmittedProgress = 0;
    const totalItems = data.boards.length + data.lists.length + data.cards.length;
    
    await ImportJob.findByIdAndUpdate(jobId, {
      totalItems,
    });

    for (const trelloBoard of data.boards) {
      try {
        const orgId = trelloBoard.idOrganization;
        const boardWorkspaceId = orgId && workspaceMap.has(orgId)
          ? workspaceMap.get(orgId)
          : workspaceId;

        const board = new Board({
          workspaceId: boardWorkspaceId,
          name: trelloBoard.name,
          description: trelloBoard.desc,
          background: trelloBoard.prefs?.background,
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

        // Import labels for this board
        if (data.labels) {
          const boardLabels = data.labels;

          const labelMap = new Map<string, string>();
          for (const trelloLabel of boardLabels) {
            const label = new BoardLabel({
              boardId: board._id,
              name: trelloLabel.name || 'Unnamed',
              color: trelloLabel.color || '#61BD4F',
              isPredefined: false,
              createdBy: userId,
            });
            await label.save();
            labelMap.set(trelloLabel.id, label._id.toString());
          }

          // Store label map for later use (we'll need to refactor this)
          (board as unknown as { _labelMap?: Map<string, string> })._labelMap = labelMap;
        }

        processed++;
        const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
        await ImportJob.findByIdAndUpdate(jobId, {
          progress,
          processedItems: processed,
        });

        // Emit Socket.io progress every 10 items
        if (processed - lastEmittedProgress >= 10) {
          emitToUser(userId, 'import:progress', {
            jobId,
            progress,
            itemsProcessed: processed,
            totalItems,
          });
          lastEmittedProgress = processed;
        }
      } catch (error) {
        logger.error({ error, boardId: trelloBoard.id }, 'Error importing Trello board');
        processed++;
      }
    }

    // Import lists
    const listMap = new Map<string, string>();
    for (const trelloList of data.lists) {
      try {
        const boardId = boardMap.get(trelloList.idBoard);
        if (!boardId) continue;

        const list = new List({
          boardId,
          name: trelloList.name,
          position: trelloList.pos / 10000, // Trello uses large numbers for position
        });
        await list.save();
        listMap.set(trelloList.id, list._id.toString());

        processed++;
        const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
        await ImportJob.findByIdAndUpdate(jobId, {
          progress,
          processedItems: processed,
        });

        // Emit Socket.io progress every 10 items
        if (processed - lastEmittedProgress >= 10) {
          emitToUser(userId, 'import:progress', {
            jobId,
            progress,
            itemsProcessed: processed,
            totalItems,
          });
          lastEmittedProgress = processed;
        }
      } catch (error) {
        logger.error({ error, listId: trelloList.id }, 'Error importing Trello list');
        processed++;
      }
    }

    // Import cards
    for (const trelloCard of data.cards) {
      try {
        const listId = listMap.get(trelloCard.idList);
        const boardId = Array.from(boardMap.values())[0]; // Get first board for now
        if (!listId || !boardId) continue;

        // Prepare comments first (async)
        const comments = await Promise.all(
          (trelloCard.comments || []).map(async (comment): Promise<ICard['comments'][0]> => {
            let commentUserId: mongoose.Types.ObjectId;
            if (comment.memberCreator.email) {
              const user = await User.findOne({ email: comment.memberCreator.email });
              commentUserId = (user?._id || new mongoose.Types.ObjectId(userId)) as mongoose.Types.ObjectId;
            } else {
              commentUserId = new mongoose.Types.ObjectId(userId);
            }
            return {
              id: crypto.randomUUID(),
              userId: commentUserId,
              text: comment.data.text,
              createdAt: new Date(comment.date),
              updatedAt: new Date(comment.date),
            };
          })
        );

        // Prepare assignees
        const assigneeIds = (trelloCard.idMembers
          ?.map((memberId) => {
            const mappedId = memberMap.get(memberId);
            return mappedId ? new mongoose.Types.ObjectId(mappedId) : null;
          })
          .filter((id): id is mongoose.Types.ObjectId => id !== null) || []);

        const card = new Card({
          listId,
          boardId,
          title: trelloCard.name.slice(0, 100),
          description: trelloCard.desc
            ? plainTextToCardDescriptionJson(trelloCard.desc)
            : undefined,
          position: trelloCard.pos / 10000,
          color: trelloCard.cover?.color,
          cover: trelloCard.cover?.url,
          labels: [],
          dueDate: trelloCard.due ? new Date(trelloCard.due) : undefined,
          completed: trelloCard.dueComplete || false,
          createdBy: new mongoose.Types.ObjectId(userId),
          assignees: assigneeIds,
          reminders: [],
          attachments: trelloCard.attachments?.map((att) => ({
            id: crypto.randomUUID(),
            name: att.name,
            url: att.url,
            type: att.mimeType || 'unknown',
            size: att.bytes || 0,
            uploadedAt: new Date(att.date),
            uploadedBy: new mongoose.Types.ObjectId(userId),
          })) || [],
          comments,
          checklists: trelloCard.checklists?.map((checklist) => ({
            id: crypto.randomUUID(),
            title: checklist.name,
            items: checklist.checkItems.map((item) => ({
              id: crypto.randomUUID(),
              text: item.name,
              completed: item.state === 'complete',
              completedAt: item.state === 'complete' ? new Date() : undefined,
            })),
          })) || [],
        });

        await card.save();

        // Create activity log
        createActivity({
          boardId,
          cardId: card._id.toString(),
          userId,
          type: 'card.created',
          description: `Card "${trelloCard.name}" imported from Trello`,
        });

        processed++;
        await ImportJob.findByIdAndUpdate(jobId, {
          progress: totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0,
          processedItems: processed,
        });
      } catch (error) {
        logger.error({ error, cardId: trelloCard.id }, 'Error importing Trello card');
        processed++;
      }
    }

    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      result: { message: 'Import completed successfully' },
    });

    // Emit final completion event
    emitToUser(userId, 'import:completed', {
      jobId,
      result: { message: 'Import completed successfully' },
    });

    logger.info({ jobId, userId }, 'Trello import completed');
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Trello import failed');
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      importErrors: [{ message: error instanceof Error ? error.message : 'Unknown error' }],
    });

    // Emit error event
    emitToUser(userId, 'import:error', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

