const ENABLED = import.meta.env.DEV;

export function logRealtime(scope: string, message: string, data?: unknown) {
  if (!ENABLED) return;
  // Keep logging concise to avoid noisy consoles while still debugging realtime flows
  if (data !== undefined) {
    console.debug(`[realtime:${scope}] ${message}`, data);
  } else {
    console.debug(`[realtime:${scope}] ${message}`);
  }
}

