import { useSyncExternalStore } from 'react';

function readDisplayMode(): 'fullscreen' | 'standalone' | 'browser' {
  try {
    if (globalThis.window == null) {
      return 'browser';
    }
    if (window.matchMedia('(display-mode: fullscreen)').matches) {
      return 'fullscreen';
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return 'standalone';
    }
    if (navigator.standalone === true) {
      // iOS Safari A2HS
      return 'standalone';
    }
  } catch {
    // ignore
  }
  return 'browser';
}

export function usePwaDisplayMode(): 'fullscreen' | 'standalone' | 'browser' {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (globalThis.window == null) {
        return () => {};
      }
      const mqStandalone = window.matchMedia('(display-mode: standalone)');
      const mqFullscreen = window.matchMedia('(display-mode: fullscreen)');
      mqStandalone.addEventListener('change', onStoreChange);
      mqFullscreen.addEventListener('change', onStoreChange);
      return () => {
        mqStandalone.removeEventListener('change', onStoreChange);
        mqFullscreen.removeEventListener('change', onStoreChange);
      };
    },
    readDisplayMode,
    () => 'browser',
  );
}

export function useIsPwa(): boolean {
  const mode = usePwaDisplayMode();
  return mode === 'fullscreen' || mode === 'standalone';
}

