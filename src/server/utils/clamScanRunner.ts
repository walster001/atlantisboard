import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Verdict, type VerdictValue } from 'pompelmi';
import {
  isLowRiskMediaMimeType,
  resolveClamScanProfile,
  type ClamScanProfile,
} from '../../shared/clamScanProfiles.js';
import { CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES, getCardAttachmentMaxBytes } from '../constants/uploads.js';
import { CLAMAV_SIGNATURE_FILES } from './clamSignatures.js';

export type { ClamScanProfile };
export { isLowRiskMediaMimeType, resolveClamScanProfile };

const DEFAULT_DB_DIR = '/var/lib/clamav';

const SCAN_EXIT_CODES: Readonly<Record<number, VerdictValue>> = {
  0: Verdict.Clean,
  1: Verdict.Malicious,
  2: Verdict.ScanError,
};

export function getClamAvDbDir(): string {
  const configured = process.env.CLAMAV_DB_DIR?.trim();
  return configured != null && configured !== '' ? configured : DEFAULT_DB_DIR;
}

import { parsePositiveInt } from '../utils/parseEnvInt.js';
function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getScanProcessTimeoutMs(): number {
  return parsePositiveInt(process.env.POMPELMI_SCAN_TIMEOUT_MS, 600_000);
}

function getMediaMaxScantimeMs(): number {
  return parseNonNegativeInt(process.env.POMPELMI_MEDIA_MAX_SCANTIME_MS, 30_000);
}

function getTextMaxScantimeMs(): number {
  return parseNonNegativeInt(process.env.POMPELMI_TEXT_MAX_SCANTIME_MS, 15_000);
}

function getOfficeMaxScantimeMs(): number {
  return parseNonNegativeInt(process.env.POMPELMI_OFFICE_MAX_SCANTIME_MS, 90_000);
}

function getPdfMaxScantimeMs(): number {
  return parseNonNegativeInt(process.env.POMPELMI_PDF_MAX_SCANTIME_MS, 120_000);
}

function getCacheMaxSize(): number {
  return parsePositiveInt(process.env.POMPELMI_SCAN_CACHE_MAX, 1_000);
}

function getCacheTtlMs(): number {
  return parsePositiveInt(process.env.POMPELMI_SCAN_CACHE_TTL_MS, 3_600_000);
}

/** When true (default), omit PUA/heuristic categories on attachment scans. */
function shouldSkipPuaDetection(): boolean {
  const unified = process.env.POMPELMI_SKIP_PUA?.trim().toLowerCase();
  if (unified === 'false') {
    return false;
  }
  if (unified === 'true') {
    return true;
  }
  return process.env.POMPELMI_MEDIA_SKIP_PUA !== 'false';
}

/** ClamAV size limit format (`100M`, `512K`). */
export function formatClamAvSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.ceil(bytes / (1024 * 1024))}M`;
  }
  return `${Math.ceil(bytes / 1024)}K`;
}

export function isScanResultCacheEnabled(): boolean {
  return process.env.POMPELMI_SCAN_CACHE !== 'false';
}

/** Exported for tests — large disk uploads stream once; small files hash first for cache hits. */
export function shouldUseSinglePassFileScan(cacheEnabled: boolean, fileSizeBytes: number): boolean {
  return !cacheEnabled || fileSizeBytes > CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES;
}

type CacheEntry = {
  readonly verdict: VerdictValue;
  readonly expiresAt: number;
};

let scanResultCache = new Map<string, CacheEntry>();

export function clearScanResultCacheForTests(): void {
  scanResultCache = new Map();
}

/** Test-only helper to assert cache hits without invoking clamscan. */
export function seedScanResultCacheEntryForTests(sha256: string, verdict: VerdictValue): void {
  setCachedVerdict(sha256, verdict);
}

function getCachedVerdict(sha256: string): VerdictValue | null {
  const entry = scanResultCache.get(sha256);
  if (entry == null) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    scanResultCache.delete(sha256);
    return null;
  }
  scanResultCache.delete(sha256);
  scanResultCache.set(sha256, entry);
  return entry.verdict;
}

function setCachedVerdict(sha256: string, verdict: VerdictValue): void {
  const now = Date.now();
  for (const [key, entry] of scanResultCache) {
    if (entry.expiresAt <= now) {
      scanResultCache.delete(key);
    }
  }
  const maxSize = getCacheMaxSize();
  if (scanResultCache.has(sha256)) {
    scanResultCache.delete(sha256);
  }
  if (scanResultCache.size >= maxSize) {
    const oldestKey = scanResultCache.keys().next().value;
    if (typeof oldestKey === 'string') {
      scanResultCache.delete(oldestKey);
    }
  }
  scanResultCache.set(sha256, {
    verdict,
    expiresAt: Date.now() + getCacheTtlMs(),
  });
}

export function sha256HexFromBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function sha256HexFromFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

function appendMaxScantime(args: string[], maxScantimeMs: number): void {
  if (maxScantimeMs > 0) {
    args.push(`--max-scantime=${maxScantimeMs}`);
  }
}

function appendSkipPua(args: string[]): void {
  if (shouldSkipPuaDetection()) {
    args.push('--detect-pua=no');
  }
}

function appendAttachmentSizeCaps(args: string[]): void {
  const limit = formatClamAvSizeLimit(getCardAttachmentMaxBytes());
  args.push(`--max-filesize=${limit}`);
  args.push(`--max-scansize=${limit}`);
}

/** Build clamscan argv for a file path or stdin (`-`). Exported for tests. */
export function buildClamScanArgs(profile: ClamScanProfile, target: string): readonly string[] {
  const args: string[] = [
    '--no-summary',
    '--quiet',
    `--database=${getClamAvDbDir()}`,
  ];

  switch (profile) {
    case 'media':
      args.push('--scan-archive=no');
      appendMaxScantime(args, getMediaMaxScantimeMs());
      appendSkipPua(args);
      break;
    case 'text':
      args.push('--scan-archive=no');
      args.push('--scan-ole2=no');
      appendMaxScantime(args, getTextMaxScantimeMs());
      appendSkipPua(args);
      break;
    case 'pdf':
      appendMaxScantime(args, getPdfMaxScantimeMs());
      appendAttachmentSizeCaps(args);
      appendSkipPua(args);
      break;
    case 'office':
      appendMaxScantime(args, getOfficeMaxScantimeMs());
      appendAttachmentSizeCaps(args);
      args.push('--max-recursion=2');
      appendSkipPua(args);
      break;
  }

  args.push(target);
  return args;
}

function mapExitCodeToVerdict(code: number | null, signal: NodeJS.Signals | null): VerdictValue {
  if (code == null) {
    return Verdict.ScanError;
  }
  if (signal != null) {
    return Verdict.ScanError;
  }
  return SCAN_EXIT_CODES[code] ?? Verdict.ScanError;
}

async function runClamScanProcess(args: readonly string[], stdin?: Buffer): Promise<VerdictValue> {
  const timeoutMs = getScanProcessTimeoutMs();

  return new Promise((resolve) => {
    const child = spawn('clamscan', [...args], {
      stdio: ['pipe', 'ignore', 'pipe'],
      shell: false,
    });

    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, timeoutMs)
        : null;

    child.stdin.on('error', () => {
      // EPIPE after stdin closed is expected once clamscan exits.
    });

    if (stdin != null) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }

    child.on('error', () => {
      if (timer != null) {
        clearTimeout(timer);
      }
      resolve(Verdict.ScanError);
    });

    child.on('close', (code, signal) => {
      if (timer != null) {
        clearTimeout(timer);
      }
      if (timedOut) {
        resolve(Verdict.ScanError);
        return;
      }
      resolve(mapExitCodeToVerdict(code, signal));
    });
  });
}

async function scanWithOptionalCache(
  sha256: string | null,
  runScan: () => Promise<VerdictValue>,
): Promise<VerdictValue> {
  if (sha256 != null && isScanResultCacheEnabled()) {
    const cached = getCachedVerdict(sha256);
    if (cached != null) {
      return cached;
    }
  }

  const verdict = await runScan();

  if (sha256 != null && isScanResultCacheEnabled() && verdict !== Verdict.ScanError) {
    setCachedVerdict(sha256, verdict);
  }

  return verdict;
}

export async function scanBufferWithClamScan(
  buffer: Buffer,
  mimeType: string,
): Promise<VerdictValue> {
  const profile = resolveClamScanProfile(mimeType);
  const sha256 = isScanResultCacheEnabled() ? sha256HexFromBuffer(buffer) : null;
  const args = buildClamScanArgs(profile, '-');

  return scanWithOptionalCache(sha256, () => runClamScanProcess(args, buffer));
}

async function scanFileSinglePassHashAndScan(
  filePath: string,
  mimeType: string,
): Promise<{ readonly verdict: VerdictValue; readonly sha256: string | null }> {
  const profile = resolveClamScanProfile(mimeType);
  const args = buildClamScanArgs(profile, '-');
  const hash = isScanResultCacheEnabled() ? createHash('sha256') : null;
  const timeoutMs = getScanProcessTimeoutMs();

  return new Promise((resolve) => {
    const child = spawn('clamscan', [...args], {
      stdio: ['pipe', 'ignore', 'pipe'],
      shell: false,
    });

    let settled = false;
    let timedOut = false;
    const stream = createReadStream(filePath);

    const finish = (result: { readonly verdict: VerdictValue; readonly sha256: string | null }): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer != null) {
        clearTimeout(timer);
      }
      stream.removeAllListeners();
      if (!stream.destroyed) {
        stream.unpipe(child.stdin);
        stream.destroy();
      }
      child.stdin.removeAllListeners('error');
      child.removeAllListeners('error');
      child.removeAllListeners('close');
      if (child.exitCode == null && child.signalCode == null) {
        child.kill('SIGKILL');
      }
      resolve(result);
    };

    let timer: ReturnType<typeof setTimeout> | null =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            finish({
              verdict: Verdict.ScanError,
              sha256: hash != null ? hash.digest('hex') : null,
            });
          }, timeoutMs)
        : null;

    stream.on('data', (chunk: Buffer | string) => {
      if (hash != null) {
        hash.update(chunk);
      }
    });
    stream.on('error', () => {
      finish({ verdict: Verdict.ScanError, sha256: null });
    });

    stream.pipe(child.stdin);
    child.stdin.on('error', () => {
      // EPIPE after stdin closed is expected once clamscan exits.
    });

    child.on('error', () => {
      finish({
        verdict: Verdict.ScanError,
        sha256: hash != null ? hash.digest('hex') : null,
      });
    });

    child.on('close', (code, signal) => {
      if (timedOut) {
        return;
      }
      finish({
        verdict: mapExitCodeToVerdict(code, signal),
        sha256: hash != null ? hash.digest('hex') : null,
      });
    });
  });
}

export async function scanFileWithClamScan(
  filePath: string,
  mimeType: string,
): Promise<VerdictValue> {
  const cacheEnabled = isScanResultCacheEnabled();
  let fileSize = 0;
  try {
    const fileStat = await stat(filePath);
    fileSize = fileStat.size;
  } catch {
    return Verdict.ScanError;
  }

  if (shouldUseSinglePassFileScan(cacheEnabled, fileSize)) {
    const { verdict, sha256 } = await scanFileSinglePassHashAndScan(filePath, mimeType);
    if (cacheEnabled && sha256 != null && verdict !== Verdict.ScanError) {
      setCachedVerdict(sha256, verdict);
    }
    return verdict;
  }

  const sha256 = await sha256HexFromFile(filePath);
  const cached = getCachedVerdict(sha256);
  if (cached != null) {
    return cached;
  }

  const profile = resolveClamScanProfile(mimeType);
  const args = buildClamScanArgs(profile, filePath);
  const verdict = await runClamScanProcess(args);
  if (verdict !== Verdict.ScanError) {
    setCachedVerdict(sha256, verdict);
  }
  return verdict;
}

/** Signature filenames used when seeding Docker images (for tests / docs alignment). */
export const CLAMSCAN_DATABASE_FILE_NAMES = CLAMAV_SIGNATURE_FILES;
