import type { BoardExportFormat } from '../../../shared/export/boardExportFormats.js';
import { buildAtlantisboardExportPayload } from './exportBoardAtlantisboard.js';
import { buildTrelloExportPayload } from './exportBoardTrello.js';
import { buildWekanExportPayload } from './exportBoardWekan.js';
import { loadBoardExportContext } from './loadBoardExportContext.js';

export type BoardJsonExportFormat = Exclude<BoardExportFormat, 'csv'>;

export async function exportBoardPayload(
  boardId: string,
  userId: string,
  format: BoardJsonExportFormat,
): Promise<unknown> {
  const ctx = await loadBoardExportContext(boardId, userId, format);
  switch (format) {
    case 'atlantisboard':
      return buildAtlantisboardExportPayload(ctx);
    case 'trello':
      return buildTrelloExportPayload(ctx);
    case 'wekan':
      return buildWekanExportPayload(ctx);
  }
}

export async function exportBoardAsCSV(
  boardId: string,
  userId: string,
  columns?: string[],
): Promise<string> {
  const ctx = await loadBoardExportContext(boardId, userId, 'csv');
  const data = {
    board: { name: ctx.board.name },
    lists: ctx.lists.map((list) => ({ id: list._id.toString(), name: list.name })),
    cards: ctx.cards.map((card) => ({
      title: card.title,
      description: card.descriptionPreview,
      listId: card.listId.toString(),
      labels: card.labels,
      dueDate: card.dueDate,
      startDate: card.startDate,
      assignees: card.assignees.map((id) => id.toString()),
      position: card.position,
      completed: card.completed,
      attachments: card.attachments.map((att) => att.name).join('; '),
    })),
  };

  const defaultColumns = ['Title', 'Description', 'List', 'Labels', 'Due Date', 'Assignees', 'Attachments'];
  const selectedColumns = columns != null && columns.length > 0 ? columns : defaultColumns;

  const headers = selectedColumns;
  const rows: string[][] = [headers];

  const listMap = new Map<string, string>();
  for (const list of data.lists) {
    listMap.set(list.id, list.name);
  }

  const columnMap: Record<string, (card: (typeof data.cards)[number], listName: string) => string> = {
    Title: (card) => card.title,
    Description: (card) => card.description || '',
    List: (_card, listName) => listName,
    Labels: (card) => card.labels.map((label) => label.name).join(', '),
    'Due Date': (card) => (card.dueDate != null ? new Date(card.dueDate).toLocaleDateString() : ''),
    'Start Date': (card) => (card.startDate != null ? new Date(card.startDate).toLocaleDateString() : ''),
    Assignees: (card) => card.assignees.join(', '),
    Position: (card) => card.position.toString(),
    Completed: (card) => (card.completed ? 'Yes' : 'No'),
    Attachments: (card) => card.attachments,
  };

  for (const card of data.cards) {
    const listName = listMap.get(card.listId) ?? 'Unknown';
    rows.push(selectedColumns.map((col) => columnMap[col]?.(card, listName) ?? ''));
  }

  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

/** @deprecated Use `exportBoardPayload(..., 'atlantisboard')`. */
export async function exportBoard(boardId: string, userId: string): Promise<unknown> {
  return exportBoardPayload(boardId, userId, 'atlantisboard');
}
