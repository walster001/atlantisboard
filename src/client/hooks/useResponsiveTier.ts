import { useSyncExternalStore } from 'react';

export type ResponsiveTier = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1199;

export function resolveResponsiveTierByWidth(width: number): ResponsiveTier {
  if (width <= MOBILE_MAX_WIDTH) {
    return 'mobile';
  }
  if (width <= TABLET_MAX_WIDTH) {
    return 'tablet';
  }
  return 'desktop';
}

function readTierFromWindow(): ResponsiveTier {
  if (typeof window === 'undefined') {
    return 'desktop';
  }
  return resolveResponsiveTierByWidth(window.innerWidth);
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener('resize', onStoreChange, { passive: true });
  globalThis.window.visualViewport?.addEventListener('resize', onStoreChange, {
    passive: true,
  });
  return () => {
    window.removeEventListener('resize', onStoreChange);
    globalThis.window.visualViewport?.removeEventListener('resize', onStoreChange);
  };
}

export function useResponsiveTier(): ResponsiveTier {
  return useSyncExternalStore(subscribe, readTierFromWindow, () => 'desktop');
}
