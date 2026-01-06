/**
 * Realtime Sync Module
 * 
 * Synchronizes Socket.IO database change events with RxDB.
 * Handles INSERT, UPDATE, DELETE events and applies them to local database.
 */

import { getRxDatabase, KanboardDatabase } from './rxdb-setup';
import { getSocketIOClient } from '@/integrations/api/socketio-client';

interface DatabaseChangePayload {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  payload: {
    new?: Record<string, unknown> | null;
    old?: Record<string, unknown> | null;
    entityType?: 'board' | 'column' | 'card' | 'cardDetail' | 'member' | 'workspace';
    entityId?: string;
    parentId?: string;
    workspaceId?: string;
    [key: string]: unknown;
  };
}

// Map table names to RxDB collection names
const TABLE_TO_COLLECTION: Record<string, keyof KanboardDatabase> = {
  boards: 'boards',
  columns: 'columns',
  cards: 'cards',
  labels: 'labels',
  cardLabels: 'cardLabels',
  cardAttachments: 'cardAttachments',
  cardSubtasks: 'cardSubtasks',
  boardMembers: 'boardMembers',
  workspaces: 'workspaces',
  workspaceMembers: 'workspaceMembers',
  // Handle snake_case table names
  board_members: 'boardMembers',
  workspace_members: 'workspaceMembers',
  card_attachments: 'cardAttachments',
  card_subtasks: 'cardSubtasks',
  card_labels: 'cardLabels',
};

/**
 * Normalize table name from snake_case to camelCase
 */
function normalizeTableName(tableName: string): string {
  return tableName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Setup realtime synchronization between Socket.IO and RxDB
 */
export async function setupRealtimeSync(
  workspaceId: string | null,
  socketClient: ReturnType<typeof getSocketIOClient>
): Promise<() => void> {
  const db = await getRxDatabase();

  // Subscribe to workspace channel if workspaceId is provided
  if (workspaceId) {
    socketClient.subscribe(`workspace:${workspaceId}`);
  }

  // Register handler for database changes
  const cleanupHandler = socketClient.onDatabaseChange(async (payload: DatabaseChangePayload) => {
    const { event, table, payload: data } = payload;
    
    // Normalize table name
    const normalizedTable = normalizeTableName(table);
    const collectionName = TABLE_TO_COLLECTION[normalizedTable];
    
    if (!collectionName) {
      console.warn(`[RealtimeSync] Unknown table: ${normalizedTable}`);
      return;
    }

    const collection = db[collectionName];
    if (!collection) {
      console.warn(`[RealtimeSync] Collection not found: ${collectionName}`);
      return;
    }

    try {
      switch (event) {
        case 'INSERT': {
          if (data.new) {
            // Check if document already exists (might have been inserted optimistically)
            const existing = await collection.findOne(data.new.id as string).exec();
            if (existing) {
              // Update existing document
              await existing.update(data.new as never);
            } else {
              // Insert new document
              await collection.insert(data.new as never);
            }
          }
          break;
        }

        case 'UPDATE': {
          if (data.new) {
            const doc = await collection.findOne(data.new.id as string).exec();
            if (doc) {
              // Update existing document
              await doc.update(data.new as never);
            } else {
              // Document doesn't exist locally, insert it
              await collection.insert(data.new as never);
            }
          }
          break;
        }

        case 'DELETE': {
          if (data.old?.id) {
            const doc = await collection.findOne(data.old.id as string).exec();
            if (doc) {
              await doc.remove();
            }
          }
          break;
        }
      }
    } catch (error) {
      console.error(`[RealtimeSync] Error processing ${event} for ${normalizedTable}:`, error);
    }
  });

  // Return cleanup function
  return () => {
    cleanupHandler();
    if (workspaceId) {
      socketClient.unsubscribe(`workspace:${workspaceId}`);
    }
  };
}

/**
 * Sync initial data from API to RxDB
 * This should be called when a page loads to populate the local database
 */
export async function syncInitialData<T extends Record<string, unknown>>(
  collectionName: keyof KanboardDatabase,
  data: T[]
): Promise<void> {
  const db = await getRxDatabase();
  const collection = db[collectionName];
  
  if (!collection) {
    console.warn(`[RealtimeSync] Collection not found: ${collectionName}`);
    return;
  }

  try {
    // Upsert all documents (insert or update if exists)
    for (const item of data) {
      if (!item.id) {
        console.warn(`[RealtimeSync] Item missing id, skipping:`, item);
        continue;
      }
      
      const existing = await collection.findOne(item.id as string).exec();
      if (existing) {
        await existing.update(item as never);
      } else {
        await collection.insert(item as never);
      }
    }
  } catch (error) {
    console.error(`[RealtimeSync] Error syncing initial data to ${String(collectionName)}:`, error);
  }
}

/**
 * Clear all data from RxDB collections
 */
export async function clearAllData(): Promise<void> {
  const db = await getRxDatabase();
  
  try {
    await Promise.all([
      db.boards.remove(),
      db.columns.remove(),
      db.cards.remove(),
      db.labels.remove(),
      db.cardLabels.remove(),
      db.cardAttachments.remove(),
      db.cardSubtasks.remove(),
      db.boardMembers.remove(),
      db.workspaces.remove(),
      db.workspaceMembers.remove(),
    ]);
  } catch (error) {
    console.error('[RealtimeSync] Error clearing data:', error);
  }
}

