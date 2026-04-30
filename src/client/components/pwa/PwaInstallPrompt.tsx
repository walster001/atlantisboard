import { Button, Paper, Stack, Text } from '@mantine/core';
import { useLayoutEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'kb.pwa.install.dismissedAt';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 3;

function shouldSuppressPrompt(): boolean {
  const raw = globalThis.localStorage.getItem(DISMISS_KEY);
  if (raw == null) {
    return false;
  }
  const ts = Number(raw);
  return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  return isIos && isSafari;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  );
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useLayoutEffect(() => {
    if (isStandalone() || shouldSuppressPrompt()) {
      return;
    }
    const handleBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    if (isIosSafari()) {
      setShowIosHint(true);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const dismiss = (): void => {
    setDeferredPrompt(null);
    setShowIosHint(false);
    globalThis.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async (): Promise<void> => {
    if (deferredPrompt == null) {
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome !== 'accepted') {
      dismiss();
      return;
    }
    setDeferredPrompt(null);
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
