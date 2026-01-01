/**
 * twemojiUtils.ts
 * 
 * Centralized utility for applying Twemoji parsing to DOM elements.
 * Uses MutationObserver to automatically re-apply Twemoji when DOM changes.
 * 
 * Key principles:
 * - Database stores UTF-8 emojis only (never Twemoji HTML)
 * - Twemoji is applied ONLY after DOM rendering (never during save/persistence)
 * - Safe to call multiple times (idempotent)
 */

import twemoji from '@twemoji/api';

// Twemoji CDN configuration
const TWEMOJI_CONFIG = {
  folder: 'svg',
  ext: '.svg',
  base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
};

/**
 * Apply Twemoji parsing to a DOM element.
 * Converts Unicode emojis to Twemoji SVG images.
 * Safe to call multiple times - already-parsed emojis are skipped.
 * 
 * @param element - The DOM element to parse
 * @param className - Optional CSS class for the Twemoji images
 */
export function applyTwemoji(element: HTMLElement, className: string = 'twemoji-inline'): void {
  if (!element) return;
  
  twemoji.parse(element, {
    ...TWEMOJI_CONFIG,
    className,
  });
}

/**
 * Create a MutationObserver that automatically applies Twemoji
 * whenever the observed element's content changes.
 * 
 * @param element - The DOM element to observe
 * @param className - Optional CSS class for the Twemoji images
 * @returns A cleanup function to disconnect the observer
 */
export function observeTwemoji(
  element: HTMLElement | null,
  className: string = 'twemoji-inline'
): () => void {
  if (!element) return () => {};
  
  // Track if we're currently parsing to prevent infinite loops
  let isParsing = false;
  
  // Debounce timer to batch rapid changes
  let debounceTimer: number | null = null;
  
  const doParse = () => {
    if (isParsing) return;
    isParsing = true;
    applyTwemoji(element, className);
    isParsing = false;
  };
  
  const parseWithDebounce = () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
    
    // Use microtask timing (0ms) for minimal delay while still batching
    debounceTimer = window.setTimeout(() => {
      doParse();
      debounceTimer = null;
    }, 0);
  };
  
  // CRITICAL: Parse immediately and synchronously on setup
  // This prevents any flash of UTF-8 emojis before Twemoji converts them
  doParse();
  
  // Create observer for future changes
  const observer = new MutationObserver((mutations) => {
    // Skip if we're the ones making changes (Twemoji adds img tags)
    if (isParsing) return;
    
    // Check if any mutation is NOT just Twemoji adding images
    const hasRelevantMutation = mutations.some((mutation) => {
      // If it's a characterData change (text content), we need to re-parse
      if (mutation.type === 'characterData') return true;
      
      // If nodes were added, check if they're Twemoji images
      if (mutation.type === 'childList') {
        // Check added nodes - if any are NOT twemoji images, re-parse
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            // Skip if it's a Twemoji image we added
            if (el.tagName === 'IMG' && el.classList.contains(className)) {
              continue;
            }
            return true;
          } else if (node.nodeType === Node.TEXT_NODE) {
            // Text nodes might contain emojis
            return true;
          }
        }
        // Check removed nodes - if content was removed, might need re-parse
        if (mutation.removedNodes.length > 0) {
          return true;
        }
      }
      
      return false;
    });
    
    if (hasRelevantMutation) {
      parseWithDebounce();
    }
  });
  
  observer.observe(element, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  
  // Return cleanup function
  return () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
    observer.disconnect();
  };
}

/**
 * React hook-compatible function to apply Twemoji after a React render.
 * Uses requestAnimationFrame to ensure DOM is stable.
 * 
 * @param element - The DOM element to parse
 * @param className - Optional CSS class for the Twemoji images
 * @returns A cleanup function
 */
export function applyTwemojiAfterRender(
  element: HTMLElement | null,
  className: string = 'twemoji-inline'
): () => void {
  if (!element) return () => {};
  
  let rafId: number | null = null;
  
  rafId = requestAnimationFrame(() => {
    applyTwemoji(element, className);
    rafId = null;
  });
  
  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  };
}
