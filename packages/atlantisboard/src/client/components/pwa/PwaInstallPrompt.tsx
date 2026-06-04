import { Button, Paper, Stack, Text } from '@mantine/core';
import { useLayoutEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Legacy: time-based dismiss (replaced by permanent skip). */
const LEGACY_DISMISS_KEY = 'kb.pwa.install.dismissedAt';
/** Permanent: do not show install UI again after dismiss, install, or `appinstalled`. */
const SKIP_KEY = 'kb.pwa.install.skip';

const DISPLAY_MODES_INSTALLED: readonly string[] = [
  'standalone',
  'fullscreen',
  'minimal-ui',
  'window-controls-overlay',
];

function readSkipFlag(): boolean {
  try {
    if (globalThis.localStorage.getItem(SKIP_KEY) === '1') {
      return true;
    }
    if (globalThis.localStorage.getItem(LEGACY_DISMISS_KEY) != null) {
      globalThis.localStorage.setItem(SKIP_KEY, '1');
      globalThis.localStorage.removeItem(LEGACY_DISMISS_KEY);
      return true;
    }
  } catch {
    /* private mode / blocked storage */
  }
  return false;
}

function setSkipFlag(): void {
  try {
    globalThis.localStorage.setItem(SKIP_KEY, '1');
    globalThis.localStorage.removeItem(LEGACY_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  for (const mode of DISPLAY_MODES_INSTALLED) {
    try {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) {
        return true;
      }
    } catch {
      /* invalid media query in some environments */
    }
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * `beforeinstallprompt` fires on desktop Chromium too. Only show our custom install UI on
 * surfaces where a home-screen style install is expected (mobile / tablet).
 */
function isMobileOrTabletInstallSurface(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const uaData = navigator as Navigator & {
    userAgentData?: { mobile?: boolean; platform?: string };
  };
  if (uaData.userAgentData != null && typeof uaData.userAgentData.mobile === 'boolean') {
    return uaData.userAgentData.mobile;
  }
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  try {
    const narrow = window.matchMedia('(max-width: 1024px)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const touch = navigator.maxTouchPoints > 0;
    return narrow && (coarse || touch);
  } catch {
    return false;
  }
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  return isIos && isSafari;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (isRunningAsInstalledPwa() || readSkipFlag()) {
      return;
    }

    const handleAppInstalled = (): void => {
      setSkipFlag();
      setDeferredPrompt(null);
      setShowIosHint(false);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    const handleBeforeInstallPrompt = (event: Event): void => {
      if (isRunningAsInstalledPwa() || readSkipFlag()) {
        event.preventDefault();
        return;
      }
      if (!isMobileOrTabletInstallSurface()) {
        return;
      }
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (isIosSafari() && !isRunningAsInstalledPwa() && !readSkipFlag()) {
      setShowIosHint(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const dismiss = (): void => {
    setSkipFlag();
    setDeferredPrompt(null);
    setShowIosHint(false);
  };

  const install = async (): Promise<void> => {
    if (deferredPrompt == null) {
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') {
      setSkipFlag();
      return;
    }
    dismiss();
  };

  if (deferredPrompt == null && !showIosHint) {
    return null;
  }

  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 4000, maxWidth: 340 }}
    >
      <Stack gap={6}>
        <Text fw={600} size="sm">
          Install Atlboard App
        </Text>
        <Text size="xs" c="dimmed">
          {deferredPrompt != null
            ? 'Install for fullscreen Android experience and fast launch from home screen.'
            : 'On iPhone/iPad: tap Share, then Add to Home Screen for standalone mode.'}
        </Text>
        <Stack gap={6}>
          {deferredPrompt != null ? (
            <Button size="xs" onClick={() => void install()}>
              Install
            </Button>
          ) : null}
          <Button size="xs" variant="light" color="gray" onClick={dismiss}>
            Not now
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
