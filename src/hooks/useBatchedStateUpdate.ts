import { useRef, useCallback } from 'react';

const BATCH_DELAY_MS = 16; // ~1 frame at 60fps

/**
 * Batches multiple state updates to prevent excessive re-renders
 * Useful when multiple realtime events fire in quick succession
 */
export function useBatchedStateUpdate<T>(
  updateFn: (updates: T[]) => void
): (update: T) => void {
  const batchRef = useRef<T[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  return useCallback((update: T) => {
    batchRef.current.push(update);
    
    if (timeoutRef.current) {
      return; // Already scheduled
    }
    
    timeoutRef.current = setTimeout(() => {
      const updates = [...batchRef.current];
      batchRef.current = [];
      timeoutRef.current = null;
      updateFn(updates);
    }, BATCH_DELAY_MS);
  }, [updateFn]);
}

