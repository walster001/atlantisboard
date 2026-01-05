import { useRef, useMemo, useEffect, useCallback } from 'react';
import { WorkspaceHandlers } from '@/realtime/workspaceSubscriptions';
import { createEventBatcher, EventBatcherOptions } from '@/realtime/eventBatcher';

// Generate unique ID for handler tracking
let handlerIdCounter = 0;
function generateHandlerId(): string {
  return `handler_${Date.now()}_${++handlerIdCounter}`;
}

export interface StableHandlerOptions {
  disableBatchingFor?: Array<keyof WorkspaceHandlers>; // Handlers to skip batching
}

/**
 * Hook that wraps realtime handlers with stable references and optional event batching.
 * Prevents stale closures by ensuring handler object reference doesn't change.
 */
export function useStableRealtimeHandlers<T extends WorkspaceHandlers>(
  handlers: T,
  dependencies: React.DependencyList,
  options?: StableHandlerOptions
): T & { __handlerId: string; __cleanup: () => void } {
  // Generate unique ID on first render
  const handlerIdRef = useRef<string | null>(null);
  if (handlerIdRef.current === null) {
    handlerIdRef.current = generateHandlerId();
  }

  // Store handlers in ref to maintain stable reference
  const handlersRef = useRef<T>(handlers);
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);

  // Update handlers ref when dependencies change
  useEffect(() => {
    handlersRef.current = handlers;
  }, dependencies);

  // Create stable handler object that doesn't change reference
  const stableHandlers = useMemo(() => {
    const stable: Partial<T> = {};
    const cleanupFunctions: Array<() => void> = [];

    // Wrap each handler with batching if it's a high-frequency handler
    const handlerKeys: Array<keyof WorkspaceHandlers> = [
      'onBoardUpdate',
      'onColumnUpdate',
      'onCardUpdate',
      'onCardDetailUpdate',
      'onMemberUpdate',
      'onWorkspaceUpdate',
      'onInviteUpdate',
      'onParentRefresh',
    ];

    const disableBatching = options?.disableBatchingFor || [];

    for (const key of handlerKeys) {
      const originalHandler = handlers[key];
      if (!originalHandler) continue;

      // Skip batching if disabled for this handler
      if (disableBatching.includes(key)) {
        // No batching - use handler directly but wrap to access latest ref
        // Type assertion needed because we're wrapping handlers with different signatures
        stable[key] = ((...args: Parameters<NonNullable<T[typeof key]>>) => {
          // Access latest handler from ref
          const currentHandler = handlersRef.current[key];
          if (currentHandler) {
            // Type assertion: currentHandler has the same type as T[typeof key]
            (currentHandler as NonNullable<T[typeof key]>)(...args);
          }
        }) as T[typeof key];
        continue;
      }

      // Determine batching options based on handler type
      let batchingOptions: EventBatcherOptions | undefined;
      
      if (key === 'onCardUpdate') {
        // High frequency - batch quickly
        batchingOptions = {
          batchDelayMs: 16,
          maxBatchSize: 50,
          deduplicateBy: (e) => (e.entity as { id?: string })?.id || '',
        };
      } else if (key === 'onColumnUpdate') {
        // High frequency - batch quickly
        batchingOptions = {
          batchDelayMs: 16,
          maxBatchSize: 50,
          deduplicateBy: (e) => (e.entity as { id?: string })?.id || '',
        };
      } else if (key === 'onBoardUpdate') {
        // Medium frequency - adaptive batching
        batchingOptions = {
          batchDelayMs: 50,
          maxBatchSize: 100,
          deduplicateBy: (e) => (e.entity as { id?: string })?.id || '',
        };
      } else if (key === 'onMemberUpdate') {
        // Lower frequency - longer delay
        batchingOptions = {
          batchDelayMs: 100,
          maxBatchSize: 100,
          deduplicateBy: (e) => {
            const entity = e.entity as { userId?: string; boardId?: string };
            return `${entity?.userId || ''}_${entity?.boardId || ''}`;
          },
        };
      }
      // onWorkspaceUpdate, onInviteUpdate, onParentRefresh - no batching (low frequency)

      if (batchingOptions) {
        // Wrap with batching
        const batcher = createEventBatcher<Parameters<NonNullable<WorkspaceHandlers[typeof key]>>[0]>((events) => {
          // Process each event in the batch
          for (const batchedEvent of events) {
            originalHandler(batchedEvent.entity as Parameters<NonNullable<WorkspaceHandlers[typeof key]>>[0], batchedEvent.event);
          }
        }, batchingOptions);

        stable[key] = batcher.handler as T[typeof key];
        cleanupFunctions.push(batcher.cleanup);
      } else {
        // No batching - use handler directly but wrap to access latest ref
        stable[key] = ((...args: Parameters<NonNullable<T[typeof key]>>) => {
          // Access latest handler from ref
          const currentHandler = handlersRef.current[key];
          if (currentHandler) {
            (currentHandler as NonNullable<T[typeof key]>)(...args);
          }
        }) as T[typeof key];
      }
    }

    cleanupFunctionsRef.current = cleanupFunctions;

    return stable as T;
  }, [handlers, ...dependencies]);

  // Cleanup function to process pending batches
  const cleanup = useCallback(() => {
    cleanupFunctionsRef.current.forEach(cleanupFn => cleanupFn());
    cleanupFunctionsRef.current = [];
  }, []);

  // Add handler ID and cleanup to returned object
  return {
    ...stableHandlers,
    __handlerId: handlerIdRef.current,
    __cleanup: cleanup,
  } as T & { __handlerId: string; __cleanup: () => void };
}

