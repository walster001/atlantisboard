import { logger } from './logger.js';

type BunWithGc = {
  readonly gc?: (force: boolean) => void;
};

/** Trigger Bun full GC after heavy jobs unless disabled via env. */
export function runBunGarbageCollection(reason: string): void {
  if (process.env.BUN_GC_AFTER_BACKUP === 'false') {
    return;
  }
  const bunGc = (globalThis as { Bun?: BunWithGc }).Bun?.gc;
  if (typeof bunGc !== 'function') {
    return;
  }
  try {
    bunGc(true);
    logger.debug({ reason }, 'Bun garbage collection completed');
  } catch (error) {
    logger.warn({ error, reason }, 'Bun garbage collection failed');
  }
}
