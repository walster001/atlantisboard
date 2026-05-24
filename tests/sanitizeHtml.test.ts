import { describe, expect, test } from 'bun:test';
import { sanitizeHtml, isBlockedSvgUpload } from '../src/shared/utils/sanitizeHtml.js';

describe('sanitizeHtml', () => {
  test('strips script tags and event handlers', () => {
    const dirty = '<p>Hello</p><img src=x onerror=alert(1)><script>alert(1)</script>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');
    expect(clean).toContain('Hello');
  });

  test('allows safe formatting tags', () => {
    const input = '<p><strong>Bold</strong> and <a href="https://example.com">link</a></p>';
    const clean = sanitizeHtml(input);
    expect(clean).toContain('<strong>Bold</strong>');
    expect(clean).toContain('href="https://example.com"');
  });

  test('removes svg payloads', () => {
    const input = '<svg onload=alert(1)><circle/></svg><p>ok</p>';
    const clean = sanitizeHtml(input);
    expect(clean.toLowerCase()).not.toContain('<svg');
    expect(clean).toContain('ok');
  });
});

describe('isBlockedSvgUpload', () => {
  test('blocks svg mime and extension', () => {
    expect(isBlockedSvgUpload('image/svg+xml')).toBe(true);
    expect(isBlockedSvgUpload('image/png', 'logo.svg')).toBe(true);
    expect(isBlockedSvgUpload('image/png', 'logo.png')).toBe(false);
  });
});
