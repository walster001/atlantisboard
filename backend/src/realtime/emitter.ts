/**
 * Realtime Event Emitter
 * 
 * Helper functions to emit realtime events from services.
 * Supports both WebSocket and Socket.IO systems during migration.
 */

import { getRealtimeServer } from './server.js';
import { emitDatabaseChange as emitSocketIODatabaseChange, emitCustomEvent as emitSocketIOCustomEvent } from './socketio-emitter.js';

// Feature flag: set to true to use Socket.IO, false for WebSocket
const USE_SOCKET_IO = process.env.USE_SOCKET_IO === 'true' || false;

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
  if (USE_SOCKET_IO) {
    // Use Socket.IO emitter
    await emitSocketIODatabaseChange(table, event, newRecord, oldRecord, boardId);
  } else {
    // Use WebSocket emitter (legacy)
    const server = getRealtimeServer();
    if (!server) {
      console.warn('[Realtime] Server not initialized, skipping event emission');
      return;
    }
    await server.emitDatabaseChange(table, event, newRecord, oldRecord, boardId);
  }
}

/**
 * Emit custom event (e.g., board.removed)
 */
export async function emitCustomEvent(
  channel: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  if (USE_SOCKET_IO) {
    // Use Socket.IO emitter
    await emitSocketIOCustomEvent(channel, eventType, payload);
  } else {
    // Use WebSocket emitter (legacy)
    const server = getRealtimeServer();
    if (!server) {
      console.warn('[Realtime] Server not initialized, skipping custom event emission');
      return;
    }
    await server.emitCustomEvent(channel, eventType, payload);
  }
}

