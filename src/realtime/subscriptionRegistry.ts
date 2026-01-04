/**
 * Global Subscription Registry
 * 
 * Tracks active workspace subscriptions at app level.
 * Prevents duplicate subscriptions and manages subscription lifecycle.
 */

import { subscribeWorkspace, WorkspaceHandlers } from './workspaceSubscriptions';
import { SubscriptionCleanup, RealtimePostgresChangesPayload } from './realtimeClient';
import { subscribeToChanges } from './realtimeClient';

const STORAGE_KEY = 'realtime_workspace_subscriptions';

// Global handler type for global channel subscriptions
type GlobalHandler = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

// Type for global subscription configuration
type GlobalSubscriptionConfig = {
  channel: string;
  table: string;
  event: RealtimePostgresChangesPayload['eventType'] | '*';
  filter?: string;
};

class SubscriptionRegistry {
  private subscriptions: Map<string, SubscriptionCleanup> = new Map();
  private handlers: Map<string, WorkspaceHandlers> = new Map();
  private handlerSets: Map<string, Set<WorkspaceHandlers>> = new Map();
  
  // Handler ownership tracking
  private handlerOwnership: Map<string, string> = new Map(); // handlerId -> workspaceId
  private handlerIdToHandler: Map<string, WorkspaceHandlers> = new Map(); // handlerId -> handler object
  
  // Global subscription storage
  private globalSubscriptions: Map<string, SubscriptionCleanup> = new Map();
  private globalHandlerSets: Map<string, Set<GlobalHandler>> = new Map();
  private globalSubscriptionConfigs: Map<string, GlobalSubscriptionConfig> = new Map();

  /**
   * Subscribe to a workspace (idempotent - won't duplicate if already subscribed)
   * Supports multiple handlers per workspace - merges handlers when multiple components subscribe
   * Returns cleanup function to remove handlers when component unmounts
   */
  subscribeWorkspace(workspaceId: string, handlers: WorkspaceHandlers): () => void {
    // Extract handler ID if present (from useStableRealtimeHandlers)
    const handlerId = (handlers as { __handlerId?: string }).__handlerId;
    
    // If handler has an ID and we've seen it before, remove the old one first
    if (handlerId && this.handlerIdToHandler.has(handlerId)) {
      const oldHandler = this.handlerIdToHandler.get(handlerId)!;
      const oldWorkspaceId = this.handlerOwnership.get(handlerId);
      if (oldWorkspaceId) {
        // Remove old handler from old workspace
        const oldHandlerSet = this.handlerSets.get(oldWorkspaceId);
        if (oldHandlerSet) {
          oldHandlerSet.delete(oldHandler);
          if (oldHandlerSet.size === 0) {
            // No handlers left, but don't unsubscribe yet (might be adding to new workspace)
          } else {
            // Update subscription with remaining handlers
            this.updateSubscription(oldWorkspaceId);
          }
        }
      }
    }

    // Initialize handler set if not exists
    if (!this.handlerSets.has(workspaceId)) {
      this.handlerSets.set(workspaceId, new Set());
    }

    // Track handler ownership
    if (handlerId) {
      this.handlerOwnership.set(handlerId, workspaceId);
      this.handlerIdToHandler.set(handlerId, handlers);
    }

    // If already subscribed, check if we need to recreate
    if (this.subscriptions.has(workspaceId)) {
      // Add handlers to set first
      this.handlerSets.get(workspaceId)!.add(handlers);
      
      // Only recreate if handler structure changed (new handler types added)
      const needsRecreation = this.detectHandlerStructureChange(workspaceId, handlers);
      if (needsRecreation) {
        this.updateSubscription(workspaceId);
      }
      // Otherwise, handlers are already in handlerSets and will be called via mergeHandlers
      // The existing subscription will continue working
      return () => {
        this.removeWorkspaceHandlers(workspaceId, handlers, handlerId);
      };
    }

    // Add handlers to set
    this.handlerSets.get(workspaceId)!.add(handlers);

    // Store handlers for persistence (keep first set for backward compatibility)
    this.handlers.set(workspaceId, handlers);

    // Subscribe to workspace with merged handlers
    const mergedHandlers = this.mergeHandlers(workspaceId);
    const cleanup = subscribeWorkspace(workspaceId, mergedHandlers);
    this.subscriptions.set(workspaceId, cleanup);

    // Persist to localStorage
    this.persistToStorage();

    // Return cleanup function to remove handlers
    return () => {
      this.removeWorkspaceHandlers(workspaceId, handlers, handlerId);
    };
  }

  /**
   * Merge all handlers for a workspace into a single handler set
   * Snapshots handler set before processing to prevent race conditions
   */
  private mergeHandlers(workspaceId: string): WorkspaceHandlers {
    const handlerSet = this.handlerSets.get(workspaceId);
    if (!handlerSet || handlerSet.size === 0) {
      return {};
    }

    // Snapshot handler set to prevent mid-execution changes
    const handlerSnapshot = Array.from(handlerSet);

    const merged: WorkspaceHandlers = {};

    // Merge onBoardUpdate handlers
    const onBoardUpdateHandlers = handlerSnapshot
      .map(h => h.onBoardUpdate)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onBoardUpdateHandlers.length > 0) {
      merged.onBoardUpdate = (board, event) => {
        // Snapshot again before processing to prevent race conditions
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onBoardUpdate)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(board, event));
      };
    }

    // Merge onColumnUpdate handlers
    const onColumnUpdateHandlers = handlerSnapshot
      .map(h => h.onColumnUpdate)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onColumnUpdateHandlers.length > 0) {
      merged.onColumnUpdate = (column, event) => {
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onColumnUpdate)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(column, event));
      };
    }

    // Merge onCardUpdate handlers
    const onCardUpdateHandlers = handlerSnapshot
      .map(h => h.onCardUpdate)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onCardUpdateHandlers.length > 0) {
      merged.onCardUpdate = (card, event) => {
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onCardUpdate)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(card, event));
      };
    }

    // Merge onCardDetailUpdate handlers
    const onCardDetailUpdateHandlers = handlerSnapshot
      .map(h => h.onCardDetailUpdate)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onCardDetailUpdateHandlers.length > 0) {
      merged.onCardDetailUpdate = (detail, event) => {
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onCardDetailUpdate)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(detail, event));
      };
    }

    // Merge onMemberUpdate handlers
    const onMemberUpdateHandlers = handlerSnapshot
      .map(h => h.onMemberUpdate)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onMemberUpdateHandlers.length > 0) {
      merged.onMemberUpdate = (member, event) => {
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onMemberUpdate)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(member, event));
      };
    }

    // Merge onWorkspaceUpdate handlers
    const onWorkspaceUpdateHandlers = handlerSnapshot
      .map(h => h.onWorkspaceUpdate)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onWorkspaceUpdateHandlers.length > 0) {
      merged.onWorkspaceUpdate = (workspace, event) => {
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onWorkspaceUpdate)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(workspace, event));
      };
    }

    // Merge onInviteUpdate handlers
    const onInviteUpdateHandlers = handlerSnapshot
      .map(h => h.onInviteUpdate)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onInviteUpdateHandlers.length > 0) {
      merged.onInviteUpdate = (invite, event) => {
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onInviteUpdate)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(invite, event));
      };
    }

    // Merge onParentRefresh handlers
    const onParentRefreshHandlers = handlerSnapshot
      .map(h => h.onParentRefresh)
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
    if (onParentRefreshHandlers.length > 0) {
      merged.onParentRefresh = (parentType, parentId) => {
        const currentSnapshot = Array.from(this.handlerSets.get(workspaceId) || []);
        const currentHandlers = currentSnapshot
          .map(h => h.onParentRefresh)
          .filter((h): h is NonNullable<typeof h> => h !== undefined);
        currentHandlers.forEach(handler => handler(parentType, parentId));
      };
    }

    return merged;
  }

  /**
   * Update existing subscription with merged handlers
   */
  private updateSubscription(workspaceId: string): void {
    const cleanup = this.subscriptions.get(workspaceId);
    if (!cleanup) return;

    // Unsubscribe old subscription
    cleanup();

    // Create new subscription with merged handlers
    const mergedHandlers = this.mergeHandlers(workspaceId);
    const newCleanup = subscribeWorkspace(workspaceId, mergedHandlers);
    this.subscriptions.set(workspaceId, newCleanup);
  }

  /**
   * Unsubscribe from a workspace
   * Only unsubscribes if no handlers remain
   */
  unsubscribeWorkspace(workspaceId: string): void {
    const handlerSet = this.handlerSets.get(workspaceId);
    if (handlerSet && handlerSet.size > 0) {
      // Still has handlers, don't unsubscribe
      return;
    }

    const cleanup = this.subscriptions.get(workspaceId);
    if (cleanup) {
      cleanup();
      this.subscriptions.delete(workspaceId);
      this.handlers.delete(workspaceId);
      this.handlerSets.delete(workspaceId);
      this.persistToStorage();
    }
  }

  /**
   * Remove specific handlers from a workspace
   * Unsubscribes if no handlers remain
   * Can remove by handler ID (preferred) or by handler reference (fallback)
   */
  removeWorkspaceHandlers(workspaceId: string, handlers: WorkspaceHandlers, handlerId?: string): void {
    const handlerSet = this.handlerSets.get(workspaceId);
    if (!handlerSet) return;

    // Try to remove by handler ID first (more reliable)
    if (handlerId && this.handlerIdToHandler.has(handlerId)) {
      const handlerToRemove = this.handlerIdToHandler.get(handlerId)!;
      handlerSet.delete(handlerToRemove);
      this.handlerIdToHandler.delete(handlerId);
      this.handlerOwnership.delete(handlerId);
    } else {
      // Fallback to reference-based removal
      handlerSet.delete(handlers);
      
      // Also clean up ownership if we can find it
      if (handlerId) {
        this.handlerIdToHandler.delete(handlerId);
        this.handlerOwnership.delete(handlerId);
      }
    }

    // Call cleanup function if handler has one
    const cleanupFn = (handlers as { __cleanup?: () => void }).__cleanup;
    if (cleanupFn && typeof cleanupFn === 'function') {
      cleanupFn();
    }

    // If no handlers remain, unsubscribe
    if (handlerSet.size === 0) {
      this.unsubscribeWorkspace(workspaceId);
    } else {
      // Update subscription with remaining handlers
      this.updateSubscription(workspaceId);
    }
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

  // ============================================================================
  // Global Subscription Methods
  // ============================================================================

  /**
   * Subscribe to a global channel (idempotent - won't duplicate if already subscribed)
   * Supports multiple handlers per channel - merges handlers when multiple components subscribe
   * Returns cleanup function to remove handlers when component unmounts
   * 
   * @param channel - The channel name (e.g., 'permissions-custom-roles')
   * @param table - The database table to subscribe to
   * @param event - The event type ('INSERT', 'UPDATE', 'DELETE', or '*')
   * @param handler - The handler function to call when events occur
   * @param filter - Optional filter string (e.g., 'boardId=eq.123')
   */
  subscribeGlobal(
    channel: string,
    table: string,
    event: RealtimePostgresChangesPayload['eventType'] | '*',
    handler: GlobalHandler,
    filter?: string
  ): SubscriptionCleanup {
    // Initialize handler set if not exists
    if (!this.globalHandlerSets.has(channel)) {
      this.globalHandlerSets.set(channel, new Set());
    }

    // Add handler to set
    this.globalHandlerSets.get(channel)!.add(handler);

    // Store subscription config if not exists (first handler determines config)
    if (!this.globalSubscriptionConfigs.has(channel)) {
      this.globalSubscriptionConfigs.set(channel, {
        channel,
        table,
        event,
        filter,
      });
    }

    // If already subscribed, just return cleanup (handlers are already merged)
    if (this.globalSubscriptions.has(channel)) {
      return () => {
        this.removeGlobalHandler(channel, handler);
      };
    }

    // Create subscription with merged handlers
    const config = this.globalSubscriptionConfigs.get(channel)!;
    const mergedHandler = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const handlers = this.globalHandlerSets.get(channel);
      if (handlers) {
        handlers.forEach(h => h(payload));
      }
    };

    const cleanup = subscribeToChanges(
      config.channel,
      [
        {
          event: config.event,
          table: config.table,
          ...(config.filter ? { filter: config.filter } : {}),
          handler: mergedHandler,
        },
      ]
    );

    this.globalSubscriptions.set(channel, cleanup);

    // Return cleanup function to remove handlers
    return () => {
      this.removeGlobalHandler(channel, handler);
    };
  }

  /**
   * Add a handler to an existing global subscription
   * More efficient than subscribeGlobal when subscription already exists
   */
  addGlobalHandler(channel: string, handler: GlobalHandler): SubscriptionCleanup {
    const handlerSet = this.globalHandlerSets.get(channel);
    if (!handlerSet) {
      throw new Error(`Cannot add handler to non-existent global subscription: ${channel}`);
    }

    handlerSet.add(handler);

    return () => {
      this.removeGlobalHandler(channel, handler);
    };
  }

  /**
   * Remove a specific handler from a global subscription
   * Unsubscribes if no handlers remain
   */
  removeGlobalHandler(channel: string, handler: GlobalHandler): void {
    const handlerSet = this.globalHandlerSets.get(channel);
    if (!handlerSet) return;

    handlerSet.delete(handler);

    // If no handlers remain, unsubscribe
    if (handlerSet.size === 0) {
      this.unsubscribeGlobal(channel);
    }
  }

  /**
   * Unsubscribe from a global channel
   * Only unsubscribes if no handlers remain
   */
  unsubscribeGlobal(channel: string): void {
    const handlerSet = this.globalHandlerSets.get(channel);
    if (handlerSet && handlerSet.size > 0) {
      // Still has handlers, don't unsubscribe
      return;
    }

    const cleanup = this.globalSubscriptions.get(channel);
    if (cleanup) {
      cleanup();
      this.globalSubscriptions.delete(channel);
      this.globalHandlerSets.delete(channel);
      this.globalSubscriptionConfigs.delete(channel);
    }
  }

  /**
   * Get all handlers for a global channel (for debugging)
   */
  getGlobalHandlers(channel: string): GlobalHandler[] | undefined {
    const handlerSet = this.globalHandlerSets.get(channel);
    return handlerSet ? Array.from(handlerSet) : undefined;
  }

  /**
   * Check if a global channel is subscribed
   */
  isGlobalSubscribed(channel: string): boolean {
    return this.globalSubscriptions.has(channel);
  }

  // ============================================================================
  // Workspace Handler Registration Methods (Optimizations)
  // ============================================================================

  /**
   * Add handlers to an existing workspace subscription
   * More efficient than subscribeWorkspace when subscription already exists
   * Returns cleanup function to remove handlers when component unmounts
   */
  addWorkspaceHandler(workspaceId: string, handlers: WorkspaceHandlers): () => void {
    if (!this.subscriptions.has(workspaceId)) {
      // If not subscribed, use regular subscribeWorkspace
      return this.subscribeWorkspace(workspaceId, handlers);
    }

    // Initialize handler set if not exists
    if (!this.handlerSets.has(workspaceId)) {
      this.handlerSets.set(workspaceId, new Set());
    }

    // Add handlers to set
    this.handlerSets.get(workspaceId)!.add(handlers);

    // Check if handler structure changed (new handler types added)
    const needsRecreation = this.detectHandlerStructureChange(workspaceId, handlers);

    if (needsRecreation) {
      // Handler structure changed, recreate subscription
      this.updateSubscription(workspaceId);
    }
    // Otherwise, handlers are already merged and will be called

    // Return cleanup function to remove handlers
    return () => {
      this.removeWorkspaceHandler(workspaceId, handlers);
    };
  }

  /**
   * Remove specific handlers from a workspace
   * More efficient than removeWorkspaceHandlers when you have the handler reference
   */
  removeWorkspaceHandler(workspaceId: string, handlers: WorkspaceHandlers): void {
    this.removeWorkspaceHandlers(workspaceId, handlers);
  }

  /**
   * Get all handlers for a workspace (for debugging)
   */
  getWorkspaceHandlers(workspaceId: string): WorkspaceHandlers[] | undefined {
    const handlerSet = this.handlerSets.get(workspaceId);
    return handlerSet ? Array.from(handlerSet) : undefined;
  }

  /**
   * Check if a workspace has a specific handler type
   */
  hasWorkspaceHandler(workspaceId: string, handlerType: keyof WorkspaceHandlers): boolean {
    const handlerSet = this.handlerSets.get(workspaceId);
    if (!handlerSet) return false;

    return Array.from(handlerSet).some(handlers => handlers[handlerType] !== undefined);
  }

  /**
   * Detect if handler structure changed (new handler types added)
   * Returns true if subscription needs to be recreated
   */
  private detectHandlerStructureChange(workspaceId: string, newHandlers: WorkspaceHandlers): boolean {
    const handlerSet = this.handlerSets.get(workspaceId);
    if (!handlerSet) return true;

    // Get existing handler types
    const existingTypes = new Set<keyof WorkspaceHandlers>();
    handlerSet.forEach(handlers => {
      Object.keys(handlers).forEach(key => {
        if (handlers[key as keyof WorkspaceHandlers]) {
          existingTypes.add(key as keyof WorkspaceHandlers);
        }
      });
    });

    // Check if new handlers introduce new types
    const newTypes = Object.keys(newHandlers).filter(
      key => newHandlers[key as keyof WorkspaceHandlers] !== undefined
    ) as (keyof WorkspaceHandlers)[];

    return newTypes.some(type => !existingTypes.has(type));
  }

  /**
   * Update unsubscribeAll to include global subscriptions
   */
  unsubscribeAll(): void {
    // Call cleanup functions for all handlers
    this.handlerIdToHandler.forEach((handlers) => {
      const cleanupFn = (handlers as { __cleanup?: () => void }).__cleanup;
      if (cleanupFn && typeof cleanupFn === 'function') {
        cleanupFn();
      }
    });

    // Unsubscribe all workspace subscriptions
    this.subscriptions.forEach((cleanup) => cleanup());
    this.subscriptions.clear();
    this.handlers.clear();
    this.handlerSets.clear();
    this.handlerOwnership.clear();
    this.handlerIdToHandler.clear();

    // Unsubscribe all global subscriptions
    this.globalSubscriptions.forEach((cleanup) => cleanup());
    this.globalSubscriptions.clear();
    this.globalHandlerSets.clear();
    this.globalSubscriptionConfigs.clear();

    this.clearStorage();
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


