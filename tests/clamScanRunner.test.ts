import { describe, it, expect, afterEach } from 'bun:test';
import { Verdict } from 'pompelmi';
import {
  buildClamScanArgs,
  clearScanResultCacheForTests,
  formatClamAvSizeLimit,
  isLowRiskMediaMimeType,
  isScanResultCacheEnabled,
  resolveClamScanProfile,
  seedScanResultCacheEntryForTests,
  sha256HexFromBuffer,
  scanBufferWithClamScan,
  shouldUseSinglePassFileScan,
} from '../src/server/utils/clamScanRunner.js';
import { CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES } from '../src/server/constants/uploads.js';

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

    it('resolves four-profile map for allowed attachment types', () => {
      expect(resolveClamScanProfile('image/png')).toBe('media');
      expect(resolveClamScanProfile('video/mp4')).toBe('media');
      expect(resolveClamScanProfile('text/plain')).toBe('text');
      expect(resolveClamScanProfile('application/pdf')).toBe('pdf');
      expect(resolveClamScanProfile('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('office');
    });
  });

  describe('formatClamAvSizeLimit', () => {
    it('formats megabyte limits for clamscan', () => {
      expect(formatClamAvSizeLimit(1024 * 1024)).toBe('1M');
      expect(formatClamAvSizeLimit(512 * 1024 * 1024)).toBe('512M');
    });
  });

  describe('buildClamScanArgs', () => {
    it('adds media fast-path flags for image uploads', () => {
      process.env.CLAMAV_DB_DIR = '/tmp/clam-test-db';
      process.env.POMPELMI_MEDIA_MAX_SCANTIME_MS = '25000';
      delete process.env.POMPELMI_SKIP_PUA;
      delete process.env.POMPELMI_MEDIA_SKIP_PUA;

      const args = buildClamScanArgs('media', '/tmp/upload.bin');
      expect(args).toContain('--scan-archive=no');
      expect(args).toContain('--max-scantime=25000');
      expect(args).toContain('--detect-pua=no');
      expect(args[args.length - 1]).toBe('/tmp/upload.bin');
    });

    it('adds text profile flags without archive or OLE parsing', () => {
      process.env.POMPELMI_TEXT_MAX_SCANTIME_MS = '12000';
      const args = buildClamScanArgs('text', '/tmp/readme.txt');
      expect(args).toContain('--scan-archive=no');
      expect(args).toContain('--scan-ole2=no');
      expect(args).toContain('--max-scantime=12000');
      expect(args).not.toContain('--max-recursion=2');
    });

    it('adds pdf profile size caps without disabling archives', () => {
      process.env.POMPELMI_PDF_MAX_SCANTIME_MS = '60000';
      const args = buildClamScanArgs('pdf', '/tmp/doc.pdf');
      expect(args).not.toContain('--scan-archive=no');
      expect(args).toContain('--max-scantime=60000');
      expect(args.some((arg) => arg.startsWith('--max-filesize='))).toBe(true);
      expect(args.some((arg) => arg.startsWith('--max-scansize='))).toBe(true);
    });

    it('adds office profile caps while keeping archive scanning defaults', () => {
      process.env.POMPELMI_OFFICE_MAX_SCANTIME_MS = '45000';
      const args = buildClamScanArgs('office', '/tmp/sheet.xlsx');
      expect(args).not.toContain('--scan-archive=no');
      expect(args).toContain('--max-scantime=45000');
      expect(args).toContain('--max-recursion=2');
      expect(args.some((arg) => arg.startsWith('--max-filesize='))).toBe(true);
    });

    it('uses stdin target for in-memory scans', () => {
      const args = buildClamScanArgs('media', '-');
      expect(args[args.length - 1]).toBe('-');
    });

    it('omits detect-pua=no when POMPELMI_SKIP_PUA=false', () => {
      process.env.POMPELMI_SKIP_PUA = 'false';
      const args = buildClamScanArgs('text', '-');
      expect(args).not.toContain('--detect-pua=no');
    });

    it('honours legacy POMPELMI_MEDIA_SKIP_PUA=false when POMPELMI_SKIP_PUA unset', () => {
      delete process.env.POMPELMI_SKIP_PUA;
      process.env.POMPELMI_MEDIA_SKIP_PUA = 'false';
      const args = buildClamScanArgs('media', '-');
      expect(args).not.toContain('--detect-pua=no');
    });
  });

  describe('file scan strategy', () => {
    it('uses single-pass when cache is disabled', () => {
      expect(shouldUseSinglePassFileScan(false, 1024)).toBe(true);
    });

    it('uses single-pass for files above disk upload threshold', () => {
      const large = CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES + 1;
      expect(shouldUseSinglePassFileScan(true, large)).toBe(true);
    });

    it('uses hash-first for small files when cache is enabled', () => {
      expect(shouldUseSinglePassFileScan(true, CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES)).toBe(false);
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
