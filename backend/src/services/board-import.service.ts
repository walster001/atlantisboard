/**
 * Board Import Service - Wekan Board Import
 * 
 * Handles importing Wekan boards with all their data (columns, cards, labels, subtasks).
 * Supports SSE streaming for progress updates.
 */

import { prisma } from '../db/client.js';

// Emoji shortcode map (simplified - full map in original edge function)
const EMOJI_SHORTCODE_MAP: Record<string, string> = {
  ':smile:': '😄',
  ':rocket:': '🚀',
  ':heart:': '❤️',
  ':fire:': '🔥',
  ':star:': '⭐',
  // Add more as needed - full map is in the edge function
};

function convertEmojiShortcodes(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [shortcode, emoji] of Object.entries(EMOJI_SHORTCODE_MAP)) {
    const regex = new RegExp(shortcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, emoji);
  }
  return result;
}

function processCardDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  let result = convertEmojiShortcodes(description);
  // Additional processing can be added here (inline buttons, HTML cleanup, etc.)
  return result.trim() || null;
}

function processCardTitle(title: string): string {
  if (!title) return title;
  return convertEmojiShortcodes(title);
}

const wekanColorMap: Record<string, string> = {
  green: '#61bd4f',
  yellow: '#f2d600',
  orange: '#ff9f1a',
  red: '#eb5a46',
  purple: '#c377e0',
  blue: '#0079bf',
  sky: '#00c2e0',
  lime: '#51e898',
  pink: '#ff78cb',
  black: '#344563',
  white: '#b3bac5',
  navy: '#026aa7',
  default: '#838c91',
};

function getWekanColor(color: string | undefined | null): string {
  if (!color) return wekanColorMap.default;
  if (color.startsWith('#')) return color;
  return wekanColorMap[color.toLowerCase()] || wekanColorMap.default;
}

interface WekanLabel {
  _id: string;
  name: string;
  color: string;
}

interface WekanChecklistItem {
  _id: string;
  title: string;
  isFinished: boolean;
  sort?: number;
}

interface WekanChecklist {
  _id: string;
  cardId: string;
  title: string;
  items: WekanChecklistItem[];
  sort?: number;
}

interface WekanCard {
  _id: string;
  title: string;
  description?: string;
  listId: string;
  labelIds?: string[];
  dueAt?: string;
  sort?: number;
  archived?: boolean;
  color?: string;
}

interface WekanList {
  _id: string;
  title: string;
  sort?: number;
  archived?: boolean;
}

interface WekanBoard {
  _id: string;
  title: string;
  description?: string;
  color?: string;
  labels?: WekanLabel[];
  lists?: WekanList[];
  cards?: WekanCard[];
  checklists?: WekanChecklist[];
}

interface ProgressUpdate {
  type: 'progress';
  stage: string;
  current: number;
  total: number;
  detail?: string;
  createdIds?: {
    workspaceId?: string;
    boardIds?: string[];
  };
}

interface ImportResult {
  type: 'result';
  success: boolean;
  workspaces_created: number;
  boards_created: number;
  columns_created: number;
  cards_created: number;
  labels_created: number;
  subtasks_created: number;
  errors: string[];
  warnings: string[];
  createdIds?: {
    workspaceId?: string;
    boardIds?: string[];
  };
}

class BoardImportService {
  async importWekanBoard(
    userId: string,
    wekanData: any,
    defaultCardColor: string | null,
    sendProgress?: (update: ProgressUpdate) => void,
    sendResult?: (result: ImportResult) => void
  ): Promise<ImportResult> {
    const createdIds: { workspaceId?: string; boardIds: string[] } = { boardIds: [] };

    const result: ImportResult = {
      type: 'result',
      success: true,
      workspaces_created: 0,
      boards_created: 0,
      columns_created: 0,
      cards_created: 0,
      labels_created: 0,
      subtasks_created: 0,
      errors: [],
      warnings: [],
    };

    sendProgress?.({ type: 'progress', stage: 'parsing', current: 0, total: 0, detail: 'Parsing Wekan data...' });

    // Handle both single board and array of boards
    const boards: WekanBoard[] = Array.isArray(wekanData) ? wekanData : [wekanData];

    // Calculate totals for progress
    let totalLabels = 0;
    let totalLists = 0;
    let totalCards = 0;
    let totalChecklists = 0;

    for (const board of boards) {
      totalLabels += (board.labels || []).length;
      totalLists += (board.lists || []).filter(l => !l.archived).length;
      totalCards += (board.cards || []).filter(c => !c.archived).length;
      totalChecklists += (board.checklists || []).length;
    }

    sendProgress?.({ type: 'progress', stage: 'workspace', current: 0, total: 1, detail: 'Creating workspace...' });

    // Create a workspace for the import
    const workspaceName = `Wekan Import ${new Date().toISOString().split('T')[0]}`;
    const workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        description: `Imported from Wekan on ${new Date().toLocaleDateString()}`,
        ownerId: userId,
        members: {
          create: {
            userId,
          },
        },
      },
    });

    result.workspaces_created = 1;
    createdIds.workspaceId = workspace.id;
    sendProgress?.({ type: 'progress', stage: 'workspace', current: 1, total: 1, detail: 'Workspace created', createdIds });

    let processedLabels = 0;
    let processedLists = 0;
    let processedCards = 0;
    let processedChecklists = 0;

    // Process each board
    for (let boardIdx = 0; boardIdx < boards.length; boardIdx++) {
      const wekanBoard = boards[boardIdx];
      try {
        if (!wekanBoard.title) {
          result.warnings.push('Skipped board without title');
          continue;
        }

        sendProgress?.({
          type: 'progress',
          stage: 'board',
          current: boardIdx + 1,
          total: boards.length,
          detail: `Creating board: ${wekanBoard.title}`,
        });

        // Determine board color
        const boardColor = getWekanColor(wekanBoard.color) || '#0079bf';

        // Create board
        const board = await prisma.board.create({
          data: {
            workspaceId: workspace.id,
            name: wekanBoard.title.substring(0, 100),
            description: wekanBoard.description?.substring(0, 1000) || null,
            backgroundColor: boardColor,
            createdBy: userId,
            members: {
              create: {
                userId,
                role: 'admin',
              },
            },
          },
        });

        result.boards_created++;
        createdIds.boardIds.push(board.id);

        sendProgress?.({
          type: 'progress',
          stage: 'board',
          current: boardIdx + 1,
          total: boards.length,
          detail: `Created board: ${wekanBoard.title}`,
          createdIds,
        });

        // Map old IDs to new IDs
        const labelIdMap = new Map<string, string>();
        const columnIdMap = new Map<string, string>();
        const cardIdMap = new Map<string, string>();

        // Create labels in batch
        const boardLabels = wekanBoard.labels || [];
        if (boardLabels.length > 0) {
          const labelInserts = boardLabels.map((wekanLabel) => ({
            boardId: board.id,
            name: (wekanLabel.name || wekanLabel.color || 'Unnamed').substring(0, 50),
            color: getWekanColor(wekanLabel.color),
          }));

          const createdLabels = await prisma.label.createManyAndReturn({
            data: labelInserts,
          });

          // Map old IDs to new IDs based on insertion order
          for (let i = 0; i < createdLabels.length; i++) {
            labelIdMap.set(boardLabels[i]._id, createdLabels[i].id);
          }
          result.labels_created += createdLabels.length;
          processedLabels += boardLabels.length;
          sendProgress?.({
            type: 'progress',
            stage: 'labels',
            current: processedLabels,
            total: totalLabels,
            detail: `Created ${boardLabels.length} labels`,
          });
        }

        // Create columns (lists) in batch
        const lists = wekanBoard.lists || [];
        const sortedLists = [...lists]
          .filter(l => !l.archived)
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));

        if (sortedLists.length > 0) {
          const columnInserts = sortedLists.map((wekanList, i) => ({
            boardId: board.id,
            title: (wekanList.title || 'Untitled').substring(0, 100),
            position: i,
          }));

          const createdColumns = await prisma.column.createManyAndReturn({
            data: columnInserts,
          });

          // Map old IDs to new IDs based on insertion order
          for (let i = 0; i < createdColumns.length; i++) {
            columnIdMap.set(sortedLists[i]._id, createdColumns[i].id);
          }
          result.columns_created += createdColumns.length;
          processedLists += sortedLists.length;
          sendProgress?.({
            type: 'progress',
            stage: 'columns',
            current: processedLists,
            total: totalLists,
            detail: `Created ${sortedLists.length} columns`,
          });
        }

        // Create cards in batches
        const cards = wekanBoard.cards || [];
        const sortedCards = [...cards]
          .filter(c => !c.archived)
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));

        // Group cards by list for proper positioning
        const cardsByList = new Map<string, WekanCard[]>();
        for (const card of sortedCards) {
          const listCards = cardsByList.get(card.listId) || [];
          listCards.push(card);
          cardsByList.set(card.listId, listCards);
        }

        // Prepare all card inserts
        const allCardInserts: Array<{
          insert: any;
          wekanCard: WekanCard;
        }> = [];

        for (const [listId, listCards] of cardsByList) {
          const columnId = columnIdMap.get(listId);
          if (!columnId) continue;

          for (let i = 0; i < listCards.length; i++) {
            const wekanCard = listCards[i];
            if (!wekanCard.title) continue;

            // Parse due date if exists
            let dueDate = null;
            if (wekanCard.dueAt) {
              try {
                dueDate = new Date(wekanCard.dueAt);
              } catch {
                // Invalid date, ignore
              }
            }

            // Determine card color
            const cardColor = wekanCard.color ? getWekanColor(wekanCard.color) : null;
            const finalCardColor = cardColor || defaultCardColor;

            // Process description and title
            const processedDescription = processCardDescription(wekanCard.description);
            const processedTitle = processCardTitle(wekanCard.title);

            allCardInserts.push({
              insert: {
                columnId,
                title: processedTitle.substring(0, 200),
                description: processedDescription,
                position: i,
                dueDate,
                createdBy: userId,
                priority: 'none',
                color: finalCardColor,
              },
              wekanCard,
            });
          }
        }

        // Insert cards in batches of 50
        const CARD_BATCH_SIZE = 50;
        for (let batchStart = 0; batchStart < allCardInserts.length; batchStart += CARD_BATCH_SIZE) {
          const batch = allCardInserts.slice(batchStart, batchStart + CARD_BATCH_SIZE);

          sendProgress?.({
            type: 'progress',
            stage: 'cards',
            current: Math.min(batchStart + CARD_BATCH_SIZE, allCardInserts.length),
            total: totalCards,
            detail: `Cards batch ${Math.floor(batchStart / CARD_BATCH_SIZE) + 1}/${Math.ceil(allCardInserts.length / CARD_BATCH_SIZE)}`,
          });

          const createdCards = await prisma.card.createManyAndReturn({
            data: batch.map(b => b.insert),
          });

          // Map old IDs to new IDs and collect card labels
          const cardLabelInserts: Array<{ cardId: string; labelId: string }> = [];

          for (let i = 0; i < createdCards.length; i++) {
            const wekanCard = batch[i].wekanCard;
            const newCardId = createdCards[i].id;
            cardIdMap.set(wekanCard._id, newCardId);
            result.cards_created++;

            // Collect card labels for batch insert
            if (wekanCard.labelIds && wekanCard.labelIds.length > 0) {
              for (const wekanLabelId of wekanCard.labelIds) {
                const labelId = labelIdMap.get(wekanLabelId);
                if (labelId) {
                  cardLabelInserts.push({ cardId: newCardId, labelId });
                }
              }
            }
          }

          // Insert all card labels for this batch at once
          if (cardLabelInserts.length > 0) {
            await prisma.cardLabel.createMany({
              data: cardLabelInserts,
            });
          }

          processedCards += batch.length;
        }

        // Create subtasks from checklists in batch
        const checklists = wekanBoard.checklists || [];
        const allSubtaskInserts: Array<{
          cardId: string;
          title: string;
          completed: boolean;
          position: number;
          checklistName: string;
        }> = [];

        for (const checklist of checklists) {
          const cardId = cardIdMap.get(checklist.cardId);
          if (!cardId) continue;

          const items = checklist.items || [];
          const sortedItems = [...items].sort((a, b) => (a.sort || 0) - (b.sort || 0));

          for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            if (!item.title) continue;

            allSubtaskInserts.push({
              cardId,
              title: item.title.substring(0, 200),
              completed: item.isFinished || false,
              position: i,
              checklistName: checklist.title || 'Checklist',
            });
          }
        }

        // Insert subtasks in batches of 100
        const SUBTASK_BATCH_SIZE = 100;
        for (let batchStart = 0; batchStart < allSubtaskInserts.length; batchStart += SUBTASK_BATCH_SIZE) {
          const batch = allSubtaskInserts.slice(batchStart, batchStart + SUBTASK_BATCH_SIZE);

          sendProgress?.({
            type: 'progress',
            stage: 'subtasks',
            current: Math.min(batchStart + SUBTASK_BATCH_SIZE, allSubtaskInserts.length),
            total: totalChecklists,
            detail: `Subtasks batch ${Math.floor(batchStart / SUBTASK_BATCH_SIZE) + 1}/${Math.ceil(allSubtaskInserts.length / SUBTASK_BATCH_SIZE)}`,
          });

          await prisma.cardSubtask.createMany({
            data: batch,
          });

          result.subtasks_created += batch.length;
          processedChecklists += batch.length;
        }

      } catch (boardError: any) {
        console.error('Error processing board:', boardError);
        const errorMessage = boardError.message || 'Failed to process board data';
        result.errors.push(`Failed to save board data: ${errorMessage}`);
      }
    }

    sendProgress?.({ type: 'progress', stage: 'complete', current: 100, total: 100, detail: 'Import complete!' });
    result.createdIds = createdIds;
    sendResult?.(result);
    return result;
  }
}

export const boardImportService = new BoardImportService();

