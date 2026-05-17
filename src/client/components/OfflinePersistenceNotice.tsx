import { useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { env } from '../config/env.js';

const OFFLINE_NOTICE_ID = 'offline-unsaved-warning';
const SERVER_POLL_MIN_MS = 3000;
const SERVER_POLL_MAX_MS = 60000;

function resolveCsrfProbeUrl(): string {
  const base = env.API_BASE_URL || '/api/v1';
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/csrf/token`;
}

async function isServerReachable(): Promise<boolean> {
  try {
    const response = await fetch(resolveCsrfProbeUrl(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function OfflinePersistenceNotice() {
  const noticeShownRef = useRef(false);
  const probeTimeoutRef = useRef<number | null>(null);
  const probeInFlightRef = useRef(false);
  const nextProbeDelayMsRef = useRef<number>(SERVER_POLL_MIN_MS);

  useEffect(() => {
    const showOfflineNotice = (): void => {
      if (noticeShownRef.current) {
        return;
      }
      noticeShownRef.current = true;
      notifications.show({
        id: OFFLINE_NOTICE_ID,
        title: 'Offline mode',
        message: 'You are offline, changes will not be saved.',
        color: 'yellow',
        autoClose: false,
        withCloseButton: false,
        loading: true,
      });
    };

    const hideOfflineNotice = (): void => {
      if (!noticeShownRef.current) {
        return;
      }
      noticeShownRef.current = false;
      notifications.hide(OFFLINE_NOTICE_ID);
    };

    const clearScheduledProbe = (): void => {
      if (probeTimeoutRef.current != null) {
        window.clearTimeout(probeTimeoutRef.current);
        probeTimeoutRef.current = null;
      }
    };

    const scheduleNextProbe = (delayMs?: number): void => {
      if (document.visibilityState === 'hidden') {
        clearScheduledProbe();
        return;
      }
      clearScheduledProbe();
      probeTimeoutRef.current = window.setTimeout(() => {
        void runProbe();
      }, delayMs ?? nextProbeDelayMsRef.current);
    };

    const runProbe = async (): Promise<void> => {
      if (probeInFlightRef.current) {
        return;
      }
      if (document.visibilityState === 'hidden') {
        return;
      }
      if (!navigator.onLine) {
        showOfflineNotice();
        nextProbeDelayMsRef.current = SERVER_POLL_MIN_MS;
        scheduleNextProbe(SERVER_POLL_MIN_MS);
        return;
      }
      probeInFlightRef.current = true;
      try {
        const ok = await isServerReachable();
        if (ok) {
          hideOfflineNotice();
          // Healthy server: back off probe cadence to keep overhead minimal.
          nextProbeDelayMsRef.current = Math.min(
            SERVER_POLL_MAX_MS,
            Math.max(SERVER_POLL_MIN_MS, Math.floor(nextProbeDelayMsRef.current * 2)),
          );
        } else {
          showOfflineNotice();
          // Server down: stay responsive.
          nextProbeDelayMsRef.current = SERVER_POLL_MIN_MS;
        }
      } finally {
        probeInFlightRef.current = false;
        scheduleNextProbe();
      }
    };

    const handleOnline = (): void => {
      nextProbeDelayMsRef.current = SERVER_POLL_MIN_MS;
      void runProbe();
    };

    const handleOffline = (): void => {
      showOfflineNotice();
      nextProbeDelayMsRef.current = SERVER_POLL_MIN_MS;
      scheduleNextProbe(SERVER_POLL_MIN_MS);
    };

    const handlePageShow = (): void => {
      nextProbeDelayMsRef.current = SERVER_POLL_MIN_MS;
      if (!navigator.onLine) {
        showOfflineNotice();
        scheduleNextProbe(SERVER_POLL_MIN_MS);
        return;
      }
      void runProbe();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        clearScheduledProbe();
        return;
      }
      nextProbeDelayMsRef.current = SERVER_POLL_MIN_MS;
      void runProbe();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    nextProbeDelayMsRef.current = SERVER_POLL_MIN_MS;
    if (!navigator.onLine) {
      showOfflineNotice();
      scheduleNextProbe(SERVER_POLL_MIN_MS);
    } else {
      void runProbe();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearScheduledProbe();
      hideOfflineNotice();
    };
  }, []);

  return null;
}

