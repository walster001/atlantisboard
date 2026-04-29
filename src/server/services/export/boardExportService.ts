import { Board } from '../../models/Board.js';
import { List } from '../../models/List.js';
import { Card } from '../../models/Card.js';
import { BoardLabel } from '../../models/BoardLabel.js';
import { hasPermission } from '../../utils/permissions.js';

export async function exportBoard(boardId: string, userId: string): Promise<unknown> {
  const board = await Board.findById(boardId);
  if (!board) {
    throw new Error('Board not found');
  }

  // Check permissions
  const allowed = await hasPermission({ id: userId }, boardId, 'boards.view');
  if (!allowed) {
    throw new Error('Access denied');
  }

  // Get all related data
  const lists = await List.find({ boardId }).sort({ position: 1 });
  const cards = await Card.find({ boardId }).sort({ listId: 1, pos: 1, position: 1, _id: 1 });
  const labels = await BoardLabel.find({ boardId });

  // Format export data
  return {
    board: {
      id: board._id.toString(),
      name: board.name,
      description: board.description,
      background: board.background,
      visibility: board.visibility,
      settings: board.settings,
    },
    lists: lists.map((list) => ({
      id: list._id.toString(),
      name: list.name,
      position: list.position,
      color: list.color,
    })),
    cards: cards.map((card) => ({
      id: card._id.toString(),
      listId: card.listId.toString(),
      title: card.title,
      description: card.description,
      position: card.position,
      color: card.color,
      cover: card.cover,
      labels: card.labels,
      dueDate: card.dueDate,
      startDate: card.startDate,
      completed: card.completed,
      assignees: card.assignees.map((id) => id.toString()),
      checklists: card.checklists,
      comments: card.comments,
      attachments: card.attachments,
    })),
    labels: labels.map((label) => ({
      id: label._id.toString(),
      name: label.name,
      color: label.color,
      isPredefined: label.isPredefined,
    })),
    exportedAt: new Date().toISOString(),
  };
}

export async function exportBoardAsCSV(
  boardId: string,
  userId: string,
  columns?: string[]
): Promise<string> {
  const exportData = await exportBoard(boardId, userId);
  const data = exportData as {
    board: { name: string };
    lists: Array<{ id: string; name: string }>;
    cards: Array<{
      title: string;
      description?: string;
      listId: string;
      labels: Array<{ name: string }>;
      dueDate?: Date;
      startDate?: Date;
      assignees: string[];
      position?: number;
      completed?: boolean;
    }>;
  };

  // Default columns if not specified
  const defaultColumns = ['Title', 'Description', 'List', 'Labels', 'Due Date', 'Assignees'];
  const selectedColumns = columns && columns.length > 0 ? columns : defaultColumns;

  // Create CSV header
  const headers = selectedColumns;
  const rows: string[][] = [headers];

  // Create list map for lookup
  const listMap = new Map<string, string>();
  data.lists.forEach((list) => {
    listMap.set(list.id, list.name);
  });

  // Column mapping
  const columnMap: Record<string, (card: typeof data.cards[0], listName: string) => string> = {
    'Title': (card) => card.title,
    'Description': (card) => card.description || '',
    'List': (_card, listName) => listName,
    'Labels': (card) => card.labels.map((l) => l.name).join(', '),
    'Due Date': (card) => card.dueDate ? new Date(card.dueDate).toLocaleDateString() : '',
    'Start Date': (card) => card.startDate ? new Date(card.startDate).toLocaleDateString() : '',
    'Assignees': (card) => card.assignees.join(', '),
    'Position': (card) => card.position?.toString() || '',
    'Completed': (card) => card.completed ? 'Yes' : 'No',
  };

  // Add card rows
  data.cards.forEach((card) => {
    const listName = listMap.get(card.listId) || 'Unknown';
    const row = selectedColumns.map((col) => {
      const mapper = columnMap[col];
      return mapper ? mapper(card, listName) : '';
    });
    rows.push(row);
  });

  // Convert to CSV
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

