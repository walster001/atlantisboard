import { describe, it, expect, afterEach } from 'bun:test';
import {
  buildMalwareScanOptions,
  getClamdMinRamMb,
  resolveClamScanMode,
  resolveUseClamd,
} from '../src/server/utils/clamScanMode.js';

describe('clamScanMode', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults min RAM threshold to 2048 MB', () => {
    delete process.env.POMPELMI_CLAMD_MIN_RAM_MB;
    expect(getClamdMinRamMb()).toBe(2048);
  });

  it('uses clamd when POMPELMI_USE_CLAMD=true regardless of RAM', async () => {
    process.env.POMPELMI_SKIP_SCAN = 'false';
    process.env.POMPELMI_USE_CLAMD = 'true';
    process.env.POMPELMI_TEST_AVAILABLE_RAM_KB = '512000';
    delete process.env.POMPELMI_CLAMD_HOST;

    expect(await resolveUseClamd()).toBe(true);
    expect(await resolveClamScanMode()).toBe('clamd');
    const opts = buildMalwareScanOptions(true);
    expect(opts.host).toBe('127.0.0.1');
    expect(opts.port).toBe(3310);
  });

  it('uses clamscan when POMPELMI_USE_CLAMD=false', async () => {
    process.env.POMPELMI_SKIP_SCAN = 'false';
    process.env.POMPELMI_USE_CLAMD = 'false';
    process.env.POMPELMI_TEST_AVAILABLE_RAM_KB = '8388608';
    delete process.env.POMPELMI_CLAMD_HOST;

    expect(await resolveUseClamd()).toBe(false);
    expect(await resolveClamScanMode()).toBe('clamscan');
    const opts = buildMalwareScanOptions(false);
    expect(opts.host).toBeUndefined();
  });

  it('auto mode uses clamd when MemAvailable meets threshold', async () => {
    process.env.POMPELMI_SKIP_SCAN = 'false';
    process.env.POMPELMI_USE_CLAMD = 'auto';
    process.env.POMPELMI_CLAMD_MIN_RAM_MB = '2048';
    process.env.POMPELMI_TEST_AVAILABLE_RAM_KB = String(2048 * 1024);
    delete process.env.POMPELMI_CLAMD_HOST;

    expect(await resolveUseClamd()).toBe(true);
  });

  it('auto mode uses clamscan when MemAvailable is below threshold', async () => {
    process.env.POMPELMI_SKIP_SCAN = 'false';
    process.env.POMPELMI_USE_CLAMD = 'auto';
    process.env.POMPELMI_CLAMD_MIN_RAM_MB = '2048';
    process.env.POMPELMI_TEST_AVAILABLE_RAM_KB = String(1024 * 1024);
    delete process.env.POMPELMI_CLAMD_HOST;

    expect(await resolveUseClamd()).toBe(false);
  });

  it('uses clamd when POMPELMI_CLAMD_HOST is set explicitly', async () => {
    process.env.POMPELMI_SKIP_SCAN = 'false';
    process.env.POMPELMI_USE_CLAMD = 'false';
    process.env.POMPELMI_CLAMD_HOST = 'clamav.internal';
    process.env.POMPELMI_CLAMD_PORT = '3311';

    expect(await resolveUseClamd()).toBe(true);
    const opts = buildMalwareScanOptions(true);
    expect(opts.host).toBe('clamav.internal');
    expect(opts.port).toBe(3311);
  });
});
