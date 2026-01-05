import { useRef, useCallback } from 'react';

const DEBOUNCE_MS = 500;

/**
 * Standard debounced fetch - prevents rapid successive calls
 * Uses batching to ensure pending calls are executed after debounce period
 */
export function useDebouncedFetch<T extends () => Promise<void>>(
  fetchFn: T
): () => void {
  const lastFetchRef = useRef<number>(0);
  const pendingFetchRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  return useCallback(() => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchRef.current;
    
    if (timeSinceLastFetch < DEBOUNCE_MS) {
      // Schedule another fetch after debounce period
      pendingFetchRef.current = true;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        if (pendingFetchRef.current) {
          pendingFetchRef.current = false;
          lastFetchRef.current = Date.now();
          fetchFn();
        }
      }, DEBOUNCE_MS - timeSinceLastFetch);
      
      return;
    }
    
    // Enough time has passed, fetch immediately
    lastFetchRef.current = now;
    pendingFetchRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    fetchFn();
  }, [fetchFn]);
}

/**
 * Silent debounced fetch - same as above but accepts a fetch function that doesn't show loading spinner
 * Used for realtime updates to prevent UI flicker
 */
export function useSilentDebouncedFetch<T extends () => Promise<void>>(
  fetchFn: T
): () => void {
  return useDebouncedFetch(fetchFn);
}

