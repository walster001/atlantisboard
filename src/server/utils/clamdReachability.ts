import { connect } from 'node:net';
import { logger } from './logger.js';
import { buildMalwareScanOptions } from './clamScanMode.js';

const DEFAULT_TIMEOUT_MS = 800;
const CACHE_TTL_MS = 30_000;

let cachedReachable: { readonly until: number; readonly value: boolean } | null = null;

function parseClamdPort(): number {
  const raw = process.env.POMPELMI_CLAMD_PORT?.trim();
  if (raw == null || raw === '') {
    return 3310;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3310;
}

function getClamdHost(): string {
  const host = process.env.POMPELMI_CLAMD_HOST?.trim();
  return host != null && host !== '' ? host : '127.0.0.1';
}

export function clearClamdReachabilityCacheForTests(): void {
  cachedReachable = null;
}

/** TCP connect probe — clamd listens but does not speak HTTP. */
export async function isClamdTcpReachable(
  host: string = getClamdHost(),
  port: number = parseClamdPort(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;

    const finish = (reachable: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(reachable);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      finish(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

export async function isClamdAvailableForScan(): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') {
    const forced = process.env.POMPELMI_TEST_CLAMD_REACHABLE?.trim().toLowerCase();
    if (forced === 'true') {
      return true;
    }
    if (forced === 'false') {
      return false;
    }
  }

  const now = Date.now();
  if (cachedReachable != null && cachedReachable.until > now) {
    return cachedReachable.value;
  }

  const opts = buildMalwareScanOptions(true);
  const host = opts.host ?? getClamdHost();
  const port = opts.port ?? parseClamdPort();
  const reachable = await isClamdTcpReachable(host, port);
  cachedReachable = { until: now + CACHE_TTL_MS, value: reachable };

  if (!reachable) {
    logger.warn({ host, port }, 'clamd configured but not reachable; falling back to clamscan');
  }

  return reachable;
}
