/**
 * RxDB React Hooks
 * 
 * Provides React hooks for querying RxDB collections reactively.
 */

import { useRxQuery, useRxData } from 'rxdb-hooks';
import { useMemo } from 'react';
import { getRxDatabase, KanboardDatabase } from '@/db/rxdb-setup';
import type {
  BoardDocument,
  ColumnDocument,
  CardDocument,
  LabelDocument,
  CardLabelDocument,
  CardAttachmentDocument,
  CardSubtaskDocument,
  BoardMemberDocument,
  WorkspaceDocument,
  WorkspaceMemberDocument,
} from '@/db/rxdb-setup';

/**
 * Hook to get boards for a workspace
 */
export function useBoards(workspaceId: string | null | undefined) {
  const query = useMemo(
    () => workspaceId ? { selector: { workspaceId } } : { selector: {} },
    [workspaceId]
  );

  const { result: boards, isFetching } = useRxData<BoardDocument>(
    'boards',
    query,
    { pageSize: 100 }
  );

  return { boards: boards || [], isLoading: isFetching };
}

/**
 * Hook to get columns for a board
 */
export function useColumns(boardId: string | null | undefined) {
  const query = useMemo(
    () => boardId ? { selector: { boardId } } : { selector: {} },
    [boardId]
  );

  const { result: columns, isFetching } = useRxData<ColumnDocument>(
    'columns',
    query,
    { pageSize: 100 }
  );

  // Sort by position
  const sortedColumns = useMemo(() => {
    if (!columns) return [];
    return [...columns].sort((a, b) => a.position - b.position);
  }, [columns]);

  return { columns: sortedColumns, isLoading: isFetching };
}

/**
 * Hook to get cards for a column
 */
export function useCards(columnId: string | null | undefined) {
  const query = useMemo(
    () => columnId ? { selector: { columnId } } : { selector: {} },
    [columnId]
  );

  const { result: cards, isFetching } = useRxData<CardDocument>(
    'cards',
    query,
    { pageSize: 100 }
  );

  // Sort by position
  const sortedCards = useMemo(() => {
    if (!cards) return [];
    return [...cards].sort((a, b) => a.position - b.position);
  }, [cards]);

  return { cards: sortedCards, isLoading: isFetching };
}

/**
 * Hook to get all cards for a board (across all columns)
 */
export function useBoardCards(boardId: string | null | undefined) {
  // First get all columns for the board
  const { columns } = useColumns(boardId);
  
  // Then get cards for each column
  const columnIds = useMemo(() => columns.map(c => c.id), [columns]);
  
  const query = useMemo(
    () => boardId && columnIds.length > 0
      ? { selector: { columnId: { $in: columnIds } } }
      : { selector: {} },
    [boardId, columnIds]
  );

  const { result: cards, isFetching } = useRxData<CardDocument>(
    'cards',
    query,
    { pageSize: 500 }
  );

  return { cards: cards || [], isLoading: isFetching };
}

/**
 * Hook to get labels for a board
 */
export function useLabels(boardId: string | null | undefined) {
  const query = useMemo(
    () => boardId ? { selector: { boardId } } : { selector: {} },
    [boardId]
  );

  const { result: labels, isFetching } = useRxData<LabelDocument>(
    'labels',
    query,
    { pageSize: 100 }
  );

  return { labels: labels || [], isLoading: isFetching };
}

/**
 * Hook to get card labels for a card
 */
export function useCardLabels(cardId: string | null | undefined) {
  const query = useMemo(
    () => cardId ? { selector: { cardId } } : { selector: {} },
    [cardId]
  );

  const { result: cardLabels, isFetching } = useRxData<CardLabelDocument>(
    'cardLabels',
    query,
    { pageSize: 100 }
  );

  // Get actual label documents
  const { result: labels } = useRxData<LabelDocument>(
    'labels',
    useMemo(() => {
      const labelIds = cardLabels?.map(cl => cl.labelId) || [];
      return labelIds.length > 0
        ? { selector: { id: { $in: labelIds } } }
        : { selector: {} };
    }, [cardLabels]),
    { pageSize: 100 }
  );

  return { cardLabels: cardLabels || [], labels: labels || [], isLoading: isFetching };
}

/**
 * Hook to get card attachments
 */
export function useCardAttachments(cardId: string | null | undefined) {
  const query = useMemo(
    () => cardId ? { selector: { cardId } } : { selector: {} },
    [cardId]
  );

  const { result: attachments, isFetching } = useRxData<CardAttachmentDocument>(
    'cardAttachments',
    query,
    { pageSize: 100 }
  );

  return { attachments: attachments || [], isLoading: isFetching };
}

/**
 * Hook to get card subtasks
 */
export function useCardSubtasks(cardId: string | null | undefined) {
  const query = useMemo(
    () => cardId ? { selector: { cardId } } : { selector: {} },
    [cardId]
  );

  const { result: subtasks, isFetching } = useRxData<CardSubtaskDocument>(
    'cardSubtasks',
    query,
    { pageSize: 100 }
  );

  // Sort by position
  const sortedSubtasks = useMemo(() => {
    if (!subtasks) return [];
    return [...subtasks].sort((a, b) => a.position - b.position);
  }, [subtasks]);

  return { subtasks: sortedSubtasks, isLoading: isFetching };
}

/**
 * Hook to get board members
 */
export function useBoardMembers(boardId: string | null | undefined) {
  const query = useMemo(
    () => boardId ? { selector: { boardId } } : { selector: {} },
    [boardId]
  );

  const { result: members, isFetching } = useRxData<BoardMemberDocument>(
    'boardMembers',
    query,
    { pageSize: 100 }
  );

  return { members: members || [], isLoading: isFetching };
}

/**
 * Hook to get workspaces
 */
export function useWorkspaces() {
  const { result: workspaces, isFetching } = useRxData<WorkspaceDocument>(
    'workspaces',
    { selector: {} },
    { pageSize: 100 }
  );

  return { workspaces: workspaces || [], isLoading: isFetching };
}

/**
 * Hook to get workspace members
 */
export function useWorkspaceMembers(workspaceId: string | null | undefined) {
  const query = useMemo(
    () => workspaceId ? { selector: { workspaceId } } : { selector: {} },
    [workspaceId]
  );

  const { result: members, isFetching } = useRxData<WorkspaceMemberDocument>(
    'workspaceMembers',
    query,
    { pageSize: 100 }
  );

  return { members: members || [], isLoading: isFetching };
}

/**
 * Hook to get a single board by ID
 */
export function useBoard(boardId: string | null | undefined) {
  const query = useMemo(
    () => boardId ? { selector: { id: boardId } } : { selector: {} },
    [boardId]
  );

  const { result: boards, isFetching } = useRxData<BoardDocument>(
    'boards',
    query,
    { pageSize: 1 }
  );

  return { board: boards?.[0] || null, isLoading: isFetching };
}

/**
 * Hook to get a single column by ID
 */
export function useColumn(columnId: string | null | undefined) {
  const query = useMemo(
    () => columnId ? { selector: { id: columnId } } : { selector: {} },
    [columnId]
  );

  const { result: columns, isFetching } = useRxData<ColumnDocument>(
    'columns',
    query,
    { pageSize: 1 }
  );

  return { column: columns?.[0] || null, isLoading: isFetching };
}

/**
 * Hook to get a single card by ID
 */
export function useCard(cardId: string | null | undefined) {
  const query = useMemo(
    () => cardId ? { selector: { id: cardId } } : { selector: {} },
    [cardId]
  );

  const { result: cards, isFetching } = useRxData<CardDocument>(
    'cards',
    query,
    { pageSize: 1 }
  );

  return { card: cards?.[0] || null, isLoading: isFetching };
}

/**
 * Helper function to update a document in RxDB
 */
export async function updateRxDocument<T extends { id: string }>(
  collectionName: keyof KanboardDatabase,
  id: string,
  updates: Partial<T>
): Promise<void> {
  const db = await getRxDatabase();
  const collection = db[collectionName];
  
  if (!collection) {
    throw new Error(`Collection not found: ${collectionName}`);
  }

  const doc = await collection.findOne(id).exec();
  if (doc) {
    await doc.update(updates as never);
  } else {
    throw new Error(`Document not found: ${id} in ${String(collectionName)}`);
  }
}

/**
 * Helper function to insert a document in RxDB
 */
export async function insertRxDocument<T extends { id: string }>(
  collectionName: keyof KanboardDatabase,
  document: T
): Promise<void> {
  const db = await getRxDatabase();
  const collection = db[collectionName];
  
  if (!collection) {
    throw new Error(`Collection not found: ${collectionName}`);
  }

  await collection.insert(document as never);
}

/**
 * Helper function to remove a document from RxDB
 */
export async function removeRxDocument(
  collectionName: keyof KanboardDatabase,
  id: string
): Promise<void> {
  const db = await getRxDatabase();
  const collection = db[collectionName];
  
  if (!collection) {
    throw new Error(`Collection not found: ${collectionName}`);
  }

  const doc = await collection.findOne(id).exec();
  if (doc) {
    await doc.remove();
  }
}

