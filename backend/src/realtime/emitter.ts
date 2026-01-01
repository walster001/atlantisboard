/**
 * Realtime Event Emitter
 * 
 * Helper functions to emit realtime events from services.
 */

import { getRealtimeServer } from './server.js';

/**
 * Emit database change event
 */
export async function emitDatabaseChange(
  table: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  newRecord?: Record<string, unknown>,
  oldRecord?: Record<string, unknown>,
  boardId?: string
) {
  const server = getRealtimeServer();
  if (!server) {
    console.warn('[Realtime] Server not initialized, skipping event emission');
    return;
  }

  await server.emitDatabaseChange(table, event, newRecord, oldRecord, boardId);
}

/**
 * Emit custom event (e.g., board.removed)
 */
export async function emitCustomEvent(
  channel: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const server = getRealtimeServer();
  if (!server) {
    console.warn('[Realtime] Server not initialized, skipping event emission');
    return;
  }

  await server.emitCustomEvent(channel, eventType, payload);
}

