import { db, type OfflineAction } from '../store/database.js';
import { api } from '../utils/api.js';
import { logger } from '../utils/logger.js';

// Note: This is a simplified offline sync implementation
// In production, you'd want more robust action execution and conflict resolution

let syncInterval: number | null = null;
let isOnline = navigator.onLine;
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;

/**
 * Initialize offline sync service
 */
export function initializeOfflineSync(): void {
  // Hot reload / repeated bootstrap safety: avoid stacking listeners.
  cleanupOfflineSync();

  // Create handler functions
  onlineHandler = handleOnline;
  offlineHandler = handleOffline;

  // Listen for online/offline events
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  // Start sync interval when online
  if (isOnline) {
    startSyncInterval();
  }

  // Try to sync any pending actions on initialization
  if (isOnline) {
    syncPendingActions().catch((error) => {
      logger.error({ error }, 'Error syncing pending actions on initialization');
    });
  }

  void cleanupOfflineActions().catch((error) => {
    logger.error({ error }, 'Error cleaning up offline actions on initialization');
  });
}

/**
 * Cleanup offline sync service (remove event listeners and clear intervals)
 */
export function cleanupOfflineSync(): void {
  stopSyncInterval();
  
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }
  
  if (offlineHandler) {
    window.removeEventListener('offline', offlineHandler);
    offlineHandler = null;
  }
}

function handleOnline(): void {
  isOnline = true;
  startSyncInterval();
  syncPendingActions().catch((error) => {
    logger.error({ error }, 'Error syncing pending actions when coming online');
  });
}

function handleOffline(): void {
  isOnline = false;
  stopSyncInterval();
}

function startSyncInterval(): void {
  if (syncInterval) {
    return;
  }

  // Sync every 30 seconds when online
  syncInterval = window.setInterval(() => {
    if (isOnline) {
      syncPendingActions().catch((error) => {
        logger.error({ error }, 'Error in periodic sync');
      });
    }
  }, 30000);
}

function stopSyncInterval(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Queue an action for offline sync
 */
export async function queueOfflineAction(
  type: OfflineAction['type'],
  resourceType: OfflineAction['resourceType'],
  resourceId: string,
  action: string,
  payload: unknown
): Promise<void> {
  const offlineAction: OfflineAction = {
    id: crypto.randomUUID(),
    type,
    resourceType,
    resourceId,
    action,
    payload,
    timestamp: new Date(),
    retries: 0,
    status: 'pending',
  };

  await db.offlineActions.add(offlineAction);

  // Try to sync immediately if online
  if (isOnline) {
    syncPendingActions().catch((error) => {
      logger.error({ error }, 'Error syncing after queueing action');
    });
  }
}

/**
 * Sync pending offline actions
 */
export async function syncPendingActions(): Promise<void> {
  if (!isOnline) {
    return;
  }

  const pendingActions = await db.offlineActions
    .where('status')
    .anyOf(['pending', 'failed'])
    .filter((action) => action.retries < 3)
    .toArray();

  for (const action of pendingActions) {
    try {
      // Update status to processing
      await db.offlineActions.update(action.id, { status: 'processing' });

      // Execute the action
      await executeOfflineAction(action);

      // Mark as completed
      await db.offlineActions.update(action.id, { status: 'completed' });
    } catch (error) {
      logger.error({ error, action }, 'Error executing offline action');
      
      // Increment retries
      const newRetries = action.retries + 1;
      const newStatus = newRetries >= 3 ? 'failed' : 'pending';
      
      await db.offlineActions.update(action.id, {
        status: newStatus,
        retries: newRetries,
      });
    }
  }

  await cleanupOfflineActions();
}

/**
 * Execute a single offline action
 */
async function executeOfflineAction(action: OfflineAction): Promise<void> {
  // Parse the action endpoint and execute accordingly
  // This is a simplified implementation - in production, you'd have a more robust action executor
  const { action: endpoint, payload, type, resourceId, resourceType } = action;

  try {
    if (type === 'create') {
      // POST request
      if (endpoint.includes('/cards') || resourceType === 'card') {
        await api.createCard(payload as { listId: string; boardId: string; title: string; description?: string });
      } else if (endpoint.includes('/lists') || resourceType === 'list') {
        await api.createList(payload as { boardId: string; name: string; position?: number });
      }
      // Add more create actions as needed
    } else if (type === 'update') {
      // PUT request
      if (endpoint.includes('/cards/') || resourceType === 'card') {
        await api.updateCard(resourceId, payload as { title?: string; description?: string; listId?: string; position?: number });
      } else if (endpoint.includes('/lists/') || resourceType === 'list') {
        await api.updateList(resourceId, payload as { name?: string; position?: number; color?: string });
      }
      // Add more update actions as needed
    } else if (type === 'delete') {
      // DELETE request
      if (endpoint.includes('/cards/') || resourceType === 'card') {
        await api.deleteCard(resourceId);
      } else if (endpoint.includes('/lists/') || resourceType === 'list') {
        await api.deleteList(resourceId);
      }
      // Add more delete actions as needed
    }
  } catch (error) {
    logger.error({ error, action }, 'Failed to execute offline action');
    throw error;
  }
}

/**
 * Clean up completed actions older than 7 days
 */
export async function cleanupOfflineActions(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  await db.offlineActions
    .where('status')
    .equals('completed')
    .and((action) => action.timestamp < cutoffDate)
    .delete();
}

/**
 * Get offline indicator status
 */
export function isOffline(): boolean {
  return !isOnline;
}

/**
 * Check if there are pending offline actions
 */
export async function hasPendingActions(): Promise<boolean> {
  const count = await db.offlineActions
    .where('status')
    .anyOf(['pending', 'processing', 'failed'])
    .count();
  return count > 0;
}

