import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { Verdict, type VerdictValue } from 'pompelmi';
import { CLAMAV_SIGNATURE_FILES } from './clamSignatures.js';

const DEFAULT_DB_DIR = '/var/lib/clamav';

const SCAN_EXIT_CODES: Readonly<Record<number, VerdictValue>> = {
  0: Verdict.Clean,
  1: Verdict.Malicious,
  2: Verdict.ScanError,
};

export type ClamScanProfile = 'media' | 'standard';

export function getClamAvDbDir(): string {
  const configured = process.env.CLAMAV_DB_DIR?.trim();
  return configured != null && configured !== '' ? configured : DEFAULT_DB_DIR;
}

/** Images and videos: no embedded archive extraction needed; safe for faster clamscan flags. */
export function isLowRiskMediaMimeType(mimeType: string): boolean {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalized.startsWith('image/') || normalized.startsWith('video/');
}

export function resolveClamScanProfile(mimeType: string): ClamScanProfile {
  if (process.env.POMPELMI_MEDIA_FAST_SCAN === 'false') {
    return 'standard';
  }
  return isLowRiskMediaMimeType(mimeType) ? 'media' : 'standard';
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

function getCacheMaxSize(): number {
  return parsePositiveInt(process.env.POMPELMI_SCAN_CACHE_MAX, 1_000);
}

function getCacheTtlMs(): number {
  return parsePositiveInt(process.env.POMPELMI_SCAN_CACHE_TTL_MS, 3_600_000);
}

export function isScanResultCacheEnabled(): boolean {
  return process.env.POMPELMI_SCAN_CACHE !== 'false';
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

/** Build clamscan argv for a file path or stdin (`-`). Exported for tests. */
export function buildClamScanArgs(profile: ClamScanProfile, target: string): readonly string[] {
  const args: string[] = [
    '--no-summary',
    '--quiet',
    `--database=${getClamAvDbDir()}`,
  ];

  if (profile === 'media') {
    args.push('--scan-archive=no');
    const maxScantimeMs = getMediaMaxScantimeMs();
    if (maxScantimeMs > 0) {
      args.push(`--max-scantime=${maxScantimeMs}`);
    }
    if (process.env.POMPELMI_MEDIA_SKIP_PUA !== 'false') {
      args.push('--detect-pua=no');
    }
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

export async function scanFileWithClamScan(
  filePath: string,
  mimeType: string,
): Promise<VerdictValue> {
  const profile = resolveClamScanProfile(mimeType);
  const sha256 = isScanResultCacheEnabled() ? await sha256HexFromFile(filePath) : null;
  const args = buildClamScanArgs(profile, filePath);

  return scanWithOptionalCache(sha256, () => runClamScanProcess(args));
}

/** Signature filenames used when seeding Docker images (for tests / docs alignment). */
export const CLAMSCAN_DATABASE_FILE_NAMES = CLAMAV_SIGNATURE_FILES;
