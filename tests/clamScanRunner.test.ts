import { describe, it, expect, afterEach } from 'bun:test';
import { Verdict } from 'pompelmi';
import {
  buildClamScanArgs,
  clearScanResultCacheForTests,
  isLowRiskMediaMimeType,
  isScanResultCacheEnabled,
  resolveClamScanProfile,
  seedScanResultCacheEntryForTests,
  sha256HexFromBuffer,
  scanBufferWithClamScan,
} from '../src/server/utils/clamScanRunner.js';

describe('clamScanRunner', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    clearScanResultCacheForTests();
  });

  describe('MIME profiles', () => {
    it('treats image and video MIME types as low-risk media', () => {
      expect(isLowRiskMediaMimeType('image/jpeg')).toBe(true);
      expect(isLowRiskMediaMimeType('image/png')).toBe(true);
      expect(isLowRiskMediaMimeType('video/mp4')).toBe(true);
      expect(isLowRiskMediaMimeType('video/webm')).toBe(true);
    });

    it('does not treat documents as low-risk media', () => {
      expect(isLowRiskMediaMimeType('application/pdf')).toBe(false);
      expect(isLowRiskMediaMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
      expect(isLowRiskMediaMimeType('text/plain')).toBe(false);
    });

    it('normalizes MIME parameters before classification', () => {
      expect(isLowRiskMediaMimeType('image/jpeg; charset=binary')).toBe(true);
    });

    it('uses media profile for images when fast scan is enabled', () => {
      delete process.env.POMPELMI_MEDIA_FAST_SCAN;
      expect(resolveClamScanProfile('image/png')).toBe('media');
    });

    it('uses standard profile when POMPELMI_MEDIA_FAST_SCAN=false', () => {
      process.env.POMPELMI_MEDIA_FAST_SCAN = 'false';
      expect(resolveClamScanProfile('image/png')).toBe('standard');
      expect(resolveClamScanProfile('application/pdf')).toBe('standard');
    });
  });

  describe('buildClamScanArgs', () => {
    it('adds media fast-path flags for image uploads', () => {
      process.env.CLAMAV_DB_DIR = '/tmp/clam-test-db';
      process.env.POMPELMI_MEDIA_MAX_SCANTIME_MS = '25000';
      delete process.env.POMPELMI_MEDIA_SKIP_PUA;

      const args = buildClamScanArgs('media', '/tmp/upload.bin');
      expect(args).toContain('--no-summary');
      expect(args).toContain('--quiet');
      expect(args).toContain('--database=/tmp/clam-test-db');
      expect(args).toContain('--scan-archive=no');
      expect(args).toContain('--max-scantime=25000');
      expect(args).toContain('--detect-pua=no');
      expect(args[args.length - 1]).toBe('/tmp/upload.bin');
    });

    it('uses stdin target for in-memory scans', () => {
      const args = buildClamScanArgs('media', '-');
      expect(args[args.length - 1]).toBe('-');
    });

    it('omits media-only flags for standard profile', () => {
      const args = buildClamScanArgs('standard', '/tmp/doc.pdf');
      expect(args).not.toContain('--scan-archive=no');
      expect(args).not.toContain('--detect-pua=no');
      expect(args[args.length - 1]).toBe('/tmp/doc.pdf');
    });

    it('omits detect-pua=no when POMPELMI_MEDIA_SKIP_PUA=false', () => {
      process.env.POMPELMI_MEDIA_SKIP_PUA = 'false';
      const args = buildClamScanArgs('media', '-');
      expect(args).not.toContain('--detect-pua=no');
    });
  });

  describe('scan result cache', () => {
    it('is enabled by default', () => {
      delete process.env.POMPELMI_SCAN_CACHE;
      expect(isScanResultCacheEnabled()).toBe(true);
    });

    it('can be disabled with POMPELMI_SCAN_CACHE=false', () => {
      process.env.POMPELMI_SCAN_CACHE = 'false';
      expect(isScanResultCacheEnabled()).toBe(false);
    });

    it('returns cached verdict without invoking clamscan', async () => {
      const buffer = Buffer.from('cached-clean-payload');
      const sha = sha256HexFromBuffer(buffer);

      clearScanResultCacheForTests();
      seedScanResultCacheEntryForTests(sha, Verdict.Clean);

      const verdict = await scanBufferWithClamScan(buffer, 'image/png');
      expect(verdict).toBe(Verdict.Clean);
    });

    it('does not use cache when POMPELMI_SCAN_CACHE=false', async () => {
      process.env.POMPELMI_SCAN_CACHE = 'false';
      const buffer = Buffer.from('uncached-payload');
      const sha = sha256HexFromBuffer(buffer);

      seedScanResultCacheEntryForTests(sha, Verdict.Clean);

      const verdict = await scanBufferWithClamScan(buffer, 'image/png');
      expect(verdict).toBe(Verdict.ScanError);
    });
  });
});
