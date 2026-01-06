/**
 * Global Realtime Manager
 * 
 * Singleton manager for WebSocket connection lifecycle.
 * Manages connection state independent of components.
 * Supports both WebSocket (legacy) and Socket.IO with RxDB.
 */

import { getRealtimeClient } from '@/integrations/api/realtime';
import { getSocketIOClient } from '@/integrations/api/socketio-client';
import { getSubscriptionRegistry } from '@/realtime/subscriptionRegistry';
import { createRxDatabase } from '@/db/rxdb-setup';
import { setupRealtimeSync } from '@/db/realtime-sync';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';

// Feature flag: set to true to use Socket.IO + RxDB, false for WebSocket
const USE_SOCKET_IO = import.meta.env.VITE_USE_SOCKET_IO === 'true' || false;

class RealtimeManager {
  private client = USE_SOCKET_IO 
    ? getSocketIOClient(API_BASE_URL)
    : getRealtimeClient(API_BASE_URL);
  private isInitialized = false;
  private rxdbInitialized = false;
  private syncCleanup: (() => void) | null = null;

  /**
   * Initialize the realtime connection with an access token
   */
  async initialize(accessToken: string): Promise<void> {
    if (this.isInitialized && accessToken) {
      // Update token if connection is already initialized
      this.client.setAuth(accessToken);
      return;
    }

    this.client.setAuth(accessToken);
    this.isInitialized = true;

    // Initialize RxDB if using Socket.IO
    if (USE_SOCKET_IO && !this.rxdbInitialized) {
      try {
        await createRxDatabase();
        this.rxdbInitialized = true;
      } catch (error) {
        console.error('[RealtimeManager] Error initializing RxDB:', error);
      }
    }
  }

  /**
   * Initialize workspace sync for Socket.IO + RxDB
   */
  async initializeWorkspaceSync(workspaceId: string | null): Promise<void> {
    if (!USE_SOCKET_IO) {
      return; // Only for Socket.IO
    }

    // Cleanup existing sync
    if (this.syncCleanup) {
      this.syncCleanup();
      this.syncCleanup = null;
    }

    // Ensure RxDB is initialized
    if (!this.rxdbInitialized) {
      await createRxDatabase();
      this.rxdbInitialized = true;
    }

    // Setup sync
    if ('onDatabaseChange' in this.client) {
      this.syncCleanup = await setupRealtimeSync(
        workspaceId,
        this.client as ReturnType<typeof getSocketIOClient>
      );
    }
  }

  /**
   * Cleanup workspace sync
   */
  cleanupWorkspaceSync(): void {
    if (this.syncCleanup) {
      this.syncCleanup();
      this.syncCleanup = null;
    }
  }

  /**
   * Disconnect the realtime connection and clear all subscriptions
   */
  disconnect(): void {
    // Cleanup workspace sync
    this.cleanupWorkspaceSync();

    // Clear all workspace subscriptions (only for WebSocket)
    if (!USE_SOCKET_IO) {
      getSubscriptionRegistry().unsubscribeAll();
    }

    // Disconnect connection
    this.client.disconnect();
    this.isInitialized = false;
  }

  /**
   * Check if the connection is initialized
   */
  isConnected(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the realtime client instance
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if using Socket.IO
   */
  isUsingSocketIO(): boolean {
    return USE_SOCKET_IO;
  }
}

// Export singleton instance
let realtimeManager: RealtimeManager | null = null;

export function getRealtimeManager(): RealtimeManager {
  if (!realtimeManager) {
    realtimeManager = new RealtimeManager();
  }
  return realtimeManager;
}


