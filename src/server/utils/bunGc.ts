import { logger } from './logger.js';

type BunWithGc = {
  readonly gc?: (force: boolean) => void;
};

export type BunGcTrigger = 'backup' | 'scan';

function isBunGcTriggerEnabled(trigger: BunGcTrigger): boolean {
  const envKey = trigger === 'backup' ? 'BUN_GC_AFTER_BACKUP' : 'BUN_GC_AFTER_SCAN';
  return process.env[envKey]?.trim().toLowerCase() !== 'false';
}

/** Trigger Bun full GC after heavy jobs unless disabled via env for that trigger. */
export function runBunGarbageCollection(reason: string, trigger: BunGcTrigger): void {
  if (!isBunGcTriggerEnabled(trigger)) {
    return;
  }
  const bunGc = (globalThis as { Bun?: BunWithGc }).Bun?.gc;
  if (typeof bunGc !== 'function') {
    return;
  }
  try {
    bunGc(true);
    logger.debug({ reason, trigger }, 'Bun garbage collection completed');
  } catch (error) {
    logger.warn({ error, reason, trigger }, 'Bun garbage collection failed');
  }
}
