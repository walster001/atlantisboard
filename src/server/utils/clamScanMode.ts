import { readFile } from 'node:fs/promises';
import { freemem } from 'node:os';
import type { ScanOptions } from 'pompelmi';
import { logger } from './logger.js';
import { shouldSkipMalwareScan } from './clamSignatures.js';
import { isClamdAvailableForScan } from './clamdReachability.js';

const DEFAULT_CLAMD_HOST = '127.0.0.1';
const DEFAULT_CLAMD_PORT = 3310;
const DEFAULT_MIN_RAM_MB = 2048;
const BYTES_PER_KB = 1024;

export type ClamScanMode = 'clamd' | 'clamscan';

export function getClamdMinRamMb(): number {
  const raw = process.env.POMPELMI_CLAMD_MIN_RAM_MB?.trim();
  if (raw == null || raw === '') {
    return DEFAULT_MIN_RAM_MB;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_RAM_MB;
}

/** MemAvailable from /proc/meminfo (kB), or null when unavailable. */
export async function readAvailableMemoryKb(): Promise<number | null> {
  const testKb = process.env.POMPELMI_TEST_AVAILABLE_RAM_KB?.trim();
  if (process.env.NODE_ENV === 'test' && testKb != null && testKb !== '') {
    const parsed = Number.parseInt(testKb, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  try {
    const meminfo = await readFile('/proc/meminfo', 'utf8');
    const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    if (match?.[1] != null) {
      const kb = Number.parseInt(match[1], 10);
      return Number.isFinite(kb) && kb >= 0 ? kb : null;
    }
  } catch {
    // non-Linux or restricted /proc
  }

  const freeBytes = freemem();
  return freeBytes > 0 ? Math.floor(freeBytes / BYTES_PER_KB) : null;
}

function parseUseClamdEnv(): 'true' | 'false' | 'auto' {
  const raw = process.env.POMPELMI_USE_CLAMD?.trim().toLowerCase();
  if (raw === 'true') {
    return 'true';
  }
  if (raw === 'false') {
    return 'false';
  }
  return 'auto';
}

async function clamdConfiguredByEnv(): Promise<boolean> {
  const explicitHost = process.env.POMPELMI_CLAMD_HOST?.trim();
  if (explicitHost != null && explicitHost !== '') {
    return true;
  }

  const mode = parseUseClamdEnv();
  if (mode === 'true') {
    return true;
  }
  if (mode === 'false') {
    return false;
  }

  const availableKb = await readAvailableMemoryKb();
  if (availableKb == null) {
    return false;
  }

  const minKb = getClamdMinRamMb() * BYTES_PER_KB;
  return availableKb >= minKb;
}

/** True when Pompelmi should scan via clamd TCP/socket instead of per-upload clamscan. */
export async function resolveUseClamd(): Promise<boolean> {
  if (shouldSkipMalwareScan()) {
    return false;
  }

  if (!(await clamdConfiguredByEnv())) {
    return false;
  }

  return isClamdAvailableForScan();
}

export async function resolveClamScanMode(): Promise<ClamScanMode> {
  return (await resolveUseClamd()) ? 'clamd' : 'clamscan';
}

function parseClamdPort(): number {
  const raw = process.env.POMPELMI_CLAMD_PORT?.trim();
  if (raw == null || raw === '') {
    return DEFAULT_CLAMD_PORT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLAMD_PORT;
}

export function buildMalwareScanOptions(useClamd: boolean): ScanOptions {
  const timeoutRaw = process.env.POMPELMI_SCAN_TIMEOUT_MS?.trim();
  const timeout =
    timeoutRaw != null && timeoutRaw !== ''
      ? Number.parseInt(timeoutRaw, 10)
      : 600_000;

  const opts: ScanOptions = {};

  if (useClamd) {
    const host = process.env.POMPELMI_CLAMD_HOST?.trim();
    opts.host = host != null && host !== '' ? host : DEFAULT_CLAMD_HOST;
    opts.port = parseClamdPort();
  }

  if (Number.isFinite(timeout) && timeout > 0) {
    opts.timeout = timeout;
  }

  return opts;
}

let loggedMode: ClamScanMode | null = null;

/** Log once at startup which scan backend is active (clamd vs clamscan). */
export async function logMalwareScanModeAtStartup(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || shouldSkipMalwareScan()) {
    return;
  }

  const mode = await resolveClamScanMode();
  if (loggedMode === mode) {
    return;
  }
  loggedMode = mode;

  if (mode === 'clamd') {
    const opts = buildMalwareScanOptions(true);
    logger.info(
      {
        mode,
        host: opts.host,
        port: opts.port,
        minRamMb: getClamdMinRamMb(),
      },
      'Malware scanning via clamd (signatures kept in daemon RAM)',
    );
    return;
  }

  const availableKb = await readAvailableMemoryKb();
  logger.info(
    {
      mode,
      availableRamMb:
        availableKb != null ? Math.round(availableKb / BYTES_PER_KB) : undefined,
      minRamMbForClamd: getClamdMinRamMb(),
      pageCacheWarm: process.env.POMPELMI_DB_PAGE_CACHE_WARM !== 'false',
    },
    'Malware scanning via on-demand clamscan (page-cache warm enabled when configured)',
  );
}
