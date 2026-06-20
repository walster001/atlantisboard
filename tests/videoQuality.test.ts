import { describe, expect, it } from 'bun:test';
import {
  buildAvailableVideoHeights,
  buildVideoAttachmentQualityMeta,
  mapSourceHeightToTier,
  parseVideoQualityPreference,
  pickVideoPlaybackHeight,
} from '../src/shared/videoQuality.js';

describe('videoQuality', () => {
  it('maps source height to the highest tier that fits', () => {
    expect(mapSourceHeightToTier(1920)).toBe(1080);
    expect(mapSourceHeightToTier(900)).toBe(720);
    expect(mapSourceHeightToTier(480)).toBe(480);
    expect(mapSourceHeightToTier(240)).toBe(null);
  });

  it('lists available heights at or below the source tier', () => {
    expect(buildAvailableVideoHeights(1080)).toEqual([1080, 720, 480, 360]);
    expect(buildAvailableVideoHeights(720)).toEqual([720, 480, 360]);
    expect(buildAvailableVideoHeights(360)).toEqual([360]);
    expect(buildAvailableVideoHeights(null)).toEqual([1080, 720, 480, 360]);
  });

  it('auto resolves to the source tier for labeling', () => {
    expect(
      pickVideoPlaybackHeight({
        preference: 'auto',
        sourceTier: 720,
      }),
    ).toBe(720);
    expect(
      pickVideoPlaybackHeight({
        preference: 'auto',
        sourceTier: null,
      }),
    ).toBe(null);
  });

  it('manual tier is capped by source tier on a single file', () => {
    expect(
      pickVideoPlaybackHeight({
        preference: '1080',
        sourceTier: 720,
      }),
    ).toBe(720);
    expect(
      pickVideoPlaybackHeight({
        preference: '480',
        sourceTier: 720,
      }),
    ).toBe(480);
  });

  it('parses quality query values', () => {
    expect(parseVideoQualityPreference('auto')).toBe('auto');
    expect(parseVideoQualityPreference('720')).toBe('720');
    expect(parseVideoQualityPreference('999')).toBe(null);
  });

  it('builds attachment quality meta from source height only', () => {
    expect(
      buildVideoAttachmentQualityMeta({
        sourceHeight: 1080,
      }),
    ).toEqual({
      sourceHeight: 1080,
      sourceTier: 1080,
      availableHeights: [1080, 720, 480, 360],
      abrEnabled: false,
      streaming: {
        ready: false,
        hlsManifestUrl: null,
        dashManifestUrl: null,
        renditionHeights: [1080, 720, 480, 360],
      },
    });
  });
});
