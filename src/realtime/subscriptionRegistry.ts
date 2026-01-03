/**
 * Global Subscription Registry
 * 
 * Tracks active workspace subscriptions at app level.
 * Prevents duplicate subscriptions and manages subscription lifecycle.
 */

import { subscribeWorkspace, WorkspaceHandlers } from './workspaceSubscriptions';
import { SubscriptionCleanup } from './realtimeClient';

const STORAGE_KEY = 'realtime_workspace_subscriptions';

class SubscriptionRegistry {
  private subscriptions: Map<string, SubscriptionCleanup> = new Map();
  private handlers: Map<string, WorkspaceHandlers> = new Map();

  /**
   * Subscribe to a workspace (idempotent - won't duplicate if already subscribed)
   */
  subscribeWorkspace(workspaceId: string, handlers: WorkspaceHandlers): void {
    // Skip if already subscribed
    if (this.subscriptions.has(workspaceId)) {
      return;
    }

    // Store handlers for persistence
    this.handlers.set(workspaceId, handlers);

    // Subscribe to workspace
    const cleanup = subscribeWorkspace(workspaceId, handlers);
    this.subscriptions.set(workspaceId, cleanup);

    // Persist to localStorage
    this.persistToStorage();
  }

  /**
   * Unsubscribe from a workspace
   */
  unsubscribeWorkspace(workspaceId: string): void {
    const cleanup = this.subscriptions.get(workspaceId);
    if (cleanup) {
      cleanup();
      this.subscriptions.delete(workspaceId);
      this.handlers.delete(workspaceId);
      this.persistToStorage();
    }
  }

  /**
   * Unsubscribe from all workspaces
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach((cleanup) => cleanup());
    this.subscriptions.clear();
    this.handlers.clear();
    this.clearStorage();
  }

  /**
   * Check if a workspace is subscribed
   */
  isSubscribed(workspaceId: string): boolean {
    return this.subscriptions.has(workspaceId);
  }

  /**
   * Get all subscribed workspace IDs
   */
  getSubscribedWorkspaces(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Restore subscriptions from localStorage
   * Note: Handlers must be provided by the caller since they can't be serialized
   */
  restoreFromStorage(handlersFactory: (workspaceId: string) => WorkspaceHandlers): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const workspaceIds: string[] = JSON.parse(stored);
      workspaceIds.forEach((workspaceId) => {
        if (!this.subscriptions.has(workspaceId)) {
          const handlers = handlersFactory(workspaceId);
          this.subscribeWorkspace(workspaceId, handlers);
        }
      });
    } catch (error) {
      console.error('[SubscriptionRegistry] Error restoring from storage:', error);
      this.clearStorage();
    }
  }

  /**
   * Persist subscriptions to localStorage
   */
  private persistToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const workspaceIds = Array.from(this.subscriptions.keys());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaceIds));
    } catch (error) {
      console.error('[SubscriptionRegistry] Error persisting to storage:', error);
    }
  }

  /**
   * Clear subscriptions from localStorage
   */
  private clearStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[SubscriptionRegistry] Error clearing storage:', error);
    }
  }
}

// Export singleton instance
let subscriptionRegistry: SubscriptionRegistry | null = null;

export function getSubscriptionRegistry(): SubscriptionRegistry {
  if (!subscriptionRegistry) {
    subscriptionRegistry = new SubscriptionRegistry();
  }
  return subscriptionRegistry;
}


