import { describe, expect, it } from 'bun:test';
import {
  audioLayoutShellStyle,
  audioLayoutsEqual,
  buildPersistedAudioLayoutAttrs,
  mergeDefaultAudioInsertLayout,
  readAudioLayoutFromAttrs,
  readHeightPxFromAudioAttrs,
  readWidthPxFromAudioAttrs,
  resolveAudioContainerStyle,
} from '../src/client/components/card/tiptapAudioLayout.js';

describe('tiptapAudioLayout', () => {
  it('builds persisted width, height, and containerStyle together', () => {
    const persisted = buildPersistedAudioLayoutAttrs('420px', '120px');
    expect(persisted.width).toBe('420');
    expect(persisted.height).toBe('120');
    expect(persisted.containerStyle).toContain('width: 420px');
    expect(persisted.containerStyle).toContain('height: 120px');
  });

  it('resolves containerStyle from width attr when style is still default', () => {
    const style = resolveAudioContainerStyle({
      width: '360',
      containerStyle: 'position: relative; width: 100%; max-width: 100%; box-sizing: border-box;',
    });
    expect(style).toContain('width: 360px');
  });

  it('reads width and height px from digit attrs', () => {
    expect(readWidthPxFromAudioAttrs({ width: '512' })).toBe('512px');
    expect(readHeightPxFromAudioAttrs({ height: '96' })).toBe('96px');
  });

  it('maps attrs to React shell style with explicit width and height', () => {
    const style = audioLayoutShellStyle({
      width: '280',
      height: '140',
    });
    expect(style.width).toBe('280px');
    expect(style.height).toBe('140px');
    expect(style.minHeight).toBe('140px');
  });

  it('prefers width and height attrs over default containerStyle width 100%', () => {
    const style = audioLayoutShellStyle({
      width: '360',
      height: '120',
      containerStyle: 'position: relative; width: 100%; max-width: 100%; box-sizing: border-box;',
    });
    expect(style.width).toBe('360px');
    expect(style.height).toBe('120px');
  });

  it('compares layout px values for flush-on-save', () => {
    expect(
      audioLayoutsEqual(
        readAudioLayoutFromAttrs({ width: '300', height: '100' }),
        readAudioLayoutFromAttrs({ width: '300', height: '100' }),
      ),
    ).toBe(true);
    expect(
      audioLayoutsEqual(
        readAudioLayoutFromAttrs({ width: '300' }),
        readAudioLayoutFromAttrs({ width: '301' }),
      ),
    ).toBe(false);
  });

  it('applies default insert height when layout attrs are omitted', () => {
    const merged = mergeDefaultAudioInsertLayout({
      src: 'blob:http://localhost/x',
      width: null,
      height: null,
    });
    const attrs = merged as Record<string, unknown>;
    expect(attrs.height).toBe('120');
    expect(attrs.width).toBeNull();
    expect(attrs.containerStyle).toContain('height: 120px');
    expect(readHeightPxFromAudioAttrs(attrs)).toBe('120px');
  });
});
