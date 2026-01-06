/**
 * Migration Helpers
 * 
 * Helper functions to support gradual migration from WebSocket to Socket.IO + RxDB.
 * These functions help bridge the gap during migration.
 */

import { syncInitialData } from '@/db/realtime-sync';
import type { BoardResponse, WorkspaceResponse } from '@/types/api';

/**
 * Sync initial data from API response to RxDB
 * Call this after fetching data from API to populate RxDB
 */
export async function syncHomeDataToRxDB(
  workspaces: WorkspaceResponse[],
  boards: BoardResponse[]
): Promise<void> {
  try {
    await Promise.all([
      syncInitialData('workspaces', workspaces),
      syncInitialData('boards', boards),
    ]);
  } catch (error) {
    console.error('[Migration] Error syncing home data to RxDB:', error);
  }
}

/**
 * Check if Socket.IO + RxDB migration is enabled
 */
export function isSocketIOMigrationEnabled(): boolean {
  return import.meta.env.VITE_USE_SOCKET_IO === 'true';
}

