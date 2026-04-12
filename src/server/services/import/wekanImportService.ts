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
import { resolveImportedCardColour } from '../../../shared/utils/importDefaultCardColour.js';

interface WekanBoard {
  _id: string;
  title: string;
  description?: string;
  archived: boolean;
  background?: string;
  permission?: 'private' | 'public';
  members?: Array<{
    userId: string;
    isAdmin: boolean;
    isActive: boolean;
  }>;
}

interface WekanList {
  _id: string;
  title: string;
  boardId: string;
  sort: number;
  archived: boolean;
  wipLimit?: number;
}

interface WekanCard {
  _id: string;
  title: string;
  description?: string;
  listId: string;
  boardId: string;
  sort: number;
  archived: boolean;
  dueAt?: string;
  startAt?: string;
  finishedAt?: string;
  cover?: string;
  members?: string[];
  labelIds?: string[];
  createdAt: string;
  modifiedAt: string;
}

interface WekanLabel {
  _id: string;
  name: string;
  color: string;
  boardId: string;
}

interface WekanChecklist {
  _id: string;
  title: string;
  cardId: string;
  items?: Array<{
    _id: string;
    title: string;
    sortOrder: number;
    finishedAt?: string;
    isFinished: boolean;
  }>;
}

interface WekanComment {
  _id: string;
  cardId: string;
  text: string;
  userId: string;
  createdAt: string;
  modifiedAt?: string;
}

interface WekanAttachment {
  _id: string;
  cardId: string;
  name: string;
  path?: string;
  url?: string;
  type: string;
  size?: number;
  userId: string;
  uploadedAt: string;
}

interface WekanUser {
  _id: string;
  username?: string;
  emails?: Array<{
    address: string;
    verified: boolean;
  }>;
  profile?: {
    fullname?: string;
  };
}

interface WekanExport {
  boards: WekanBoard[];
  lists: WekanList[];
  cards: WekanCard[];
  labels?: WekanLabel[];
  checklists?: WekanChecklist[];
  comments?: WekanComment[];
  attachments?: WekanAttachment[];
  users?: WekanUser[];
}

/** Keys Wekan nests alongside board fields in a single-board JSON export (not part of the board document). */
const WEKAN_SINGLE_BOARD_NESTED_KEYS = new Set([
  'lists',
  'cards',
  'labels',
  'checklists',
  'comments',
  'attachments',
  'users',
  'swimlanes',
  'customFields',
  'activities',
  'triggers',
  'integrations',
]);

function stripToWekanBoard(obj: Record<string, unknown>): WekanBoard {
  const board: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!WEKAN_SINGLE_BOARD_NESTED_KEYS.has(key)) {
      board[key] = value;
    }
  }
  return board as unknown as WekanBoard;
}

/**
 * Wekan can export either:
 * - Aggregate: `{ boards: [...], lists: [...], cards: [...], ... }`
 * - Single board (common from UI): one object with `_id`, `title`, and `lists` / `cards` at the same level as board fields.
 */
function normalizeWekanExport(raw: unknown): WekanExport {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Wekan import: expected a JSON object at the root.');
  }

  const o = raw as Record<string, unknown>;

  if (typeof o.data === 'object' && o.data !== null && !Array.isArray(o.data)) {
    return normalizeWekanExport(o.data);
  }

  if (o.board != null && typeof o.board === 'object' && !Array.isArray(o.boards)) {
    const { board, ...rest } = o;
    return normalizeWekanExport({
      ...rest,
      boards: [board as Record<string, unknown>],
    });
  }

  if (Array.isArray(o.boards) && o.boards.length > 0) {
    const out: WekanExport = {
      boards: o.boards as WekanBoard[],
      lists: Array.isArray(o.lists) ? (o.lists as WekanList[]) : [],
      cards: Array.isArray(o.cards) ? (o.cards as WekanCard[]) : [],
    };
    if (Array.isArray(o.labels)) {
      out.labels = o.labels as WekanLabel[];
    }
    if (Array.isArray(o.checklists)) {
      out.checklists = o.checklists as WekanChecklist[];
    }
    if (Array.isArray(o.comments)) {
      out.comments = o.comments as WekanComment[];
    }
    if (Array.isArray(o.attachments)) {
      out.attachments = o.attachments as WekanAttachment[];
    }
    if (Array.isArray(o.users)) {
      out.users = o.users as WekanUser[];
    }
    return out;
  }

  const hasBoardId = typeof o._id === 'string';
  const hasListsArray = Array.isArray(o.lists);
  const formatLooksLikeWekan =
    typeof o._format === 'string' && o._format.toLowerCase().includes('wekan');

  if (hasBoardId && (hasListsArray || formatLooksLikeWekan)) {
    const out: WekanExport = {
      boards: [stripToWekanBoard(o)],
      lists: hasListsArray ? (o.lists as WekanList[]) : [],
      cards: Array.isArray(o.cards) ? (o.cards as WekanCard[]) : [],
    };
    if (Array.isArray(o.labels)) {
      out.labels = o.labels as WekanLabel[];
    }
    if (Array.isArray(o.checklists)) {
      out.checklists = o.checklists as WekanChecklist[];
    }
    if (Array.isArray(o.comments)) {
      out.comments = o.comments as WekanComment[];
    }
    if (Array.isArray(o.attachments)) {
      out.attachments = o.attachments as WekanAttachment[];
    }
    if (Array.isArray(o.users)) {
      out.users = o.users as WekanUser[];
    }
    return out;
  }

  throw new Error(
    'Wekan import: unrecognized JSON. Expected a "boards" array, a single-board export (with _id and lists or _format wekan-board), or a { board, lists, cards } style wrapper.'
  );
}

export async function importWekan(
  jsonData: unknown,
  userId: string,
  defaultUncolouredCardColour?: string,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days, matches ImportJob TTL
  const importJob = new ImportJob({
    userId,
    type: 'wekan',
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
    const data = normalizeWekanExport(jsonData);

    if (data.boards.length === 0) {
      throw new Error('Wekan import: no boards found in file.');
    }

    // Map Wekan users to application users (by email or username)
    const userMap = new Map<string, string>();
    if (data.users) {
      for (const wekanUser of data.users) {
        let matchedUser: (typeof User) | null = null;

        // Try to match by email first
        if (wekanUser.emails && wekanUser.emails.length > 0) {
          const email = wekanUser.emails[0].address;
          matchedUser = await User.findOne({ email });
        }

        // If no email match, try username
        if (!matchedUser && wekanUser.username) {
          matchedUser = await User.findOne({ username: wekanUser.username });
        }

        if (matchedUser) {
          const userId = (matchedUser as unknown as { _id: { toString: () => string } })._id.toString();
          userMap.set(wekanUser._id, userId);
        } else {
          // Create placeholder user
          const placeholderUser = new User({
            email: wekanUser.emails?.[0]?.address || `placeholder-${wekanUser._id}@wekan.import`,
            username: wekanUser.username || `wekan_${wekanUser._id}`,
            displayName: wekanUser.profile?.fullname || wekanUser.username || 'Imported User',
            passwordHash: undefined, // No password for placeholder
            emailVerified: false,
            isPlaceholder: true,
            placeholderSource: 'wekan',
            placeholderEmail: wekanUser.emails?.[0]?.address,
            placeholderName: wekanUser.profile?.fullname || wekanUser.username,
            preferences: {
              theme: 'light',
              notifications: true,
              language: 'en',
              notificationPreferences: {},
            },
          });
          await placeholderUser.save();
          userMap.set(wekanUser._id, placeholderUser._id.toString());
        }
      }
    }

    // Import boards - each Wekan board becomes a workspace with one board
    const workspaceMap = new Map<string, string>();
    const boardMap = new Map<string, string>();
    let processed = 0;
    let lastEmittedProgress = 0;
    const totalItems =
      data.boards.length + data.lists.length + data.cards.length;

    await ImportJob.findByIdAndUpdate(jobId, {
      totalItems,
    });

    for (const wekanBoard of data.boards) {
      try {
        // Create workspace for each Wekan board
        const workspace = new Workspace({
          name: wekanBoard.title || `Imported from Wekan - ${wekanBoard._id}`,
          description: wekanBoard.description,
          ownerId: userId,
          visibility: wekanBoard.permission === 'public' ? 'public' : 'private',
          members: [],
        });
        await workspace.save();
        workspaceMap.set(wekanBoard._id, workspace._id.toString());

        // Create board within workspace
        const board = new Board({
          workspaceId: workspace._id.toString(),
          name: wekanBoard.title,
          description: wekanBoard.description,
          background: wekanBoard.background,
          visibility: wekanBoard.permission === 'public' ? 'public' : 'workspace',
          ownerId: userId,
          members: (wekanBoard.members || []).map((member) => ({
            userId: new mongoose.Types.ObjectId(userMap.get(member.userId) || userId),
            role: member.isAdmin ? 'admin' : 'viewer',
            addedAt: new Date(),
          })),
          settings: {
            allowComments: true,
            allowAttachments: true,
            cardCoverImages: true,
          },
        });
        await board.save();
        boardMap.set(wekanBoard._id, board._id.toString());

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
        logger.error({ error, boardId: wekanBoard._id }, 'Error importing Wekan board');
        processed++;
      }
    }

    // Import labels
    const labelMap = new Map<string, string>();
    if (data.labels) {
      for (const wekanLabel of data.labels) {
        try {
          const boardId = boardMap.get(wekanLabel.boardId);
          if (!boardId) continue;

          const label = new BoardLabel({
            boardId,
            name: wekanLabel.name || 'Unnamed',
            color: wekanLabel.color || '#61BD4F',
            isPredefined: false,
            createdBy: userId,
          });
          await label.save();
          labelMap.set(wekanLabel._id, label._id.toString());
        } catch (error) {
          logger.error({ error, labelId: wekanLabel._id }, 'Error importing Wekan label');
        }
      }
    }

    // Import lists
    const listMap = new Map<string, string>();
    for (const wekanList of data.lists) {
      try {
        const boardId = boardMap.get(wekanList.boardId);
        if (!boardId) continue;

        const list = new List({
          boardId,
          name: wekanList.title,
          position: wekanList.sort || 0,
        });
        await list.save();
        listMap.set(wekanList._id, list._id.toString());

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
        logger.error({ error, listId: wekanList._id }, 'Error importing Wekan list');
        processed++;
      }
    }

    // Import cards
    for (const wekanCard of data.cards) {
      try {
        const listId = listMap.get(wekanCard.listId);
        const boardId = boardMap.get(wekanCard.boardId);
        if (!listId || !boardId) continue;

        // Map labels
        const cardLabels = (wekanCard.labelIds || [])
          .map((labelId) => labelMap.get(labelId))
          .filter((id): id is string => id !== undefined)
          .map((id) => ({
            id,
            name: '', // Will be populated from BoardLabel
            color: '',
          }));

        // Map assignees
        const assigneeIds = (wekanCard.members || [])
          .map((memberId) => {
            const mappedId = userMap.get(memberId);
            return mappedId ? new mongoose.Types.ObjectId(mappedId) : null;
          })
          .filter((id): id is mongoose.Types.ObjectId => id !== null);

        // Map checklists
        const cardChecklists = (data.checklists || [])
          .filter((checklist) => checklist.cardId === wekanCard._id)
          .map((checklist) => ({
            id: crypto.randomUUID(),
            title: checklist.title,
            items: (checklist.items || []).map((item) => ({
              id: crypto.randomUUID(),
              text: item.title,
              completed: item.isFinished || false,
              completedAt: item.finishedAt ? new Date(item.finishedAt) : undefined,
              sortOrder: item.sortOrder,
            })),
          }));

        // Map comments
        const cardComments = await Promise.all(
          (data.comments || [])
            .filter((comment) => comment.cardId === wekanCard._id)
            .map(async (comment): Promise<ICard['comments'][0]> => {
              const commentUserId = userMap.get(comment.userId);
              return {
                id: crypto.randomUUID(),
                userId: new mongoose.Types.ObjectId(commentUserId || userId),
                text: comment.text,
                createdAt: new Date(comment.createdAt),
                updatedAt: new Date(comment.modifiedAt || comment.createdAt),
              };
            })
        );

        // Map attachments (as placeholders)
        const cardAttachments = (data.attachments || [])
          .filter((attachment) => attachment.cardId === wekanCard._id)
          .map((attachment) => ({
            id: crypto.randomUUID(),
            name: attachment.name,
            url: attachment.url || attachment.path || '',
            type: attachment.type || 'unknown',
            size: attachment.size || 0,
            uploadedAt: new Date(attachment.uploadedAt),
            uploadedBy: new mongoose.Types.ObjectId(userMap.get(attachment.userId) || userId),
          }));

        const card = new Card({
          listId,
          boardId,
          title: wekanCard.title.slice(0, 100),
          description: wekanCard.description
            ? plainTextToCardDescriptionJson(
                `[Attachment: ${wekanCard.description}]`,
              )
            : undefined,
          position: wekanCard.sort || 0,
          color: resolveImportedCardColour(
            /^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? wekanCard.cover : undefined,
            defaultUncolouredCardColour,
          ),
          cover: /^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? undefined : wekanCard.cover,
          labels: cardLabels,
          dueDate: wekanCard.dueAt ? new Date(wekanCard.dueAt) : undefined,
          startDate: wekanCard.startAt ? new Date(wekanCard.startAt) : undefined,
          completed: !!wekanCard.finishedAt,
          completedAt: wekanCard.finishedAt ? new Date(wekanCard.finishedAt) : undefined,
          createdBy: new mongoose.Types.ObjectId(userId),
          assignees: assigneeIds,
          reminders: [],
          attachments: cardAttachments,
          comments: cardComments,
          checklists: cardChecklists,
        });

        await card.save();

        // Create activity log
        createActivity({
          boardId,
          cardId: card._id.toString(),
          userId,
          type: 'card.created',
          description: `Card "${wekanCard.title}" imported from Wekan`,
        });

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
        logger.error({ error, cardId: wekanCard._id }, 'Error importing Wekan card');
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

    logger.info({ jobId, userId }, 'Wekan import completed');
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Wekan import failed');
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

