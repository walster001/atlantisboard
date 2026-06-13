import { describe, expect, it } from 'bun:test';
import {
  resolveClamScanProfile,
  isLowRiskMediaMimeType,
  CARD_ATTACHMENT_OFFICE_MIMES,
  CARD_ATTACHMENT_TEXT_MIMES,
} from '../src/shared/clamScanProfiles.js';

describe('clamScanProfiles', () => {
  it('maps image and video MIME types to media profile', () => {
    expect(resolveClamScanProfile('image/png')).toBe('media');
    expect(resolveClamScanProfile('video/mp4')).toBe('media');
    expect(isLowRiskMediaMimeType('image/jpeg; charset=binary')).toBe(true);
  });

  it('maps plain-text attachment MIME types to text profile', () => {
    for (const mime of CARD_ATTACHMENT_TEXT_MIMES) {
      expect(resolveClamScanProfile(mime)).toBe('text');
    }
  });

  it('maps PDF to pdf profile', () => {
    expect(resolveClamScanProfile('application/pdf')).toBe('pdf');
  });

  it('maps Office Open XML types to office profile', () => {
    for (const mime of CARD_ATTACHMENT_OFFICE_MIMES) {
      expect(resolveClamScanProfile(mime)).toBe('office');
    }
  });

  it('falls back to office for unknown MIME types', () => {
    expect(resolveClamScanProfile('application/octet-stream')).toBe('office');
  });
});
