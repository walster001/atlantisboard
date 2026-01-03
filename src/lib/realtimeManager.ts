/**
 * Global Realtime Manager
 * 
 * Singleton manager for WebSocket connection lifecycle.
 * Manages connection state independent of components.
 */

import { getRealtimeClient } from '@/integrations/api/realtime';
import { getSubscriptionRegistry } from '@/realtime/subscriptionRegistry';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';

class RealtimeManager {
  private client = getRealtimeClient(API_BASE_URL);
  private isInitialized = false;

  /**
   * Initialize the realtime connection with an access token
   */
  initialize(accessToken: string): void {
    if (this.isInitialized && accessToken) {
      // Update token if connection is already initialized
      this.client.setAuth(accessToken);
      return;
    }

    this.client.setAuth(accessToken);
    this.isInitialized = true;
  }

  /**
   * Disconnect the realtime connection and clear all subscriptions
   */
  disconnect(): void {
    // Clear all workspace subscriptions
    getSubscriptionRegistry().unsubscribeAll();
    // Disconnect WebSocket connection
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
}

// Export singleton instance
let realtimeManager: RealtimeManager | null = null;

export function getRealtimeManager(): RealtimeManager {
  if (!realtimeManager) {
    realtimeManager = new RealtimeManager();
  }
  return realtimeManager;
}


