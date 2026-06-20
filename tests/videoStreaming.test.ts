import { describe, expect, it } from 'bun:test';
import {
  buildVideoAbrManifestUrls,
  buildVideoAbrStreamPath,
  resolveAbrLevelIndex,
  resolveAbrTargetHeight,
} from '../src/shared/videoStreaming.js';

describe('videoStreaming', () => {
  it('builds authenticated ABR stream paths', () => {
    expect(buildVideoAbrStreamPath('att-1', 'hls', 'hls/master.m3u8')).toBe(
      '/api/v1/attachments/att-1/stream/hls?path=hls%2Fmaster.m3u8',
    );
    expect(buildVideoAbrStreamPath('att-1', 'dash', 'dash/chunk-v1-00001.m4s')).toBe(
      '/api/v1/attachments/att-1/stream/dash?path=dash%2Fchunk-v1-00001.m4s',
    );
  });

  it('builds manifest URLs for video-meta consumers', () => {
    expect(buildVideoAbrManifestUrls('vid-9')).toEqual({
      hlsManifestUrl: '/api/v1/attachments/vid-9/stream/hls?path=hls%2Fmaster.m3u8',
      dashManifestUrl: '/api/v1/attachments/vid-9/stream/dash?path=dash%2Fmanifest.mpd',
    });
  });

  it('maps manual quality to the nearest packaged rendition', () => {
    expect(
      resolveAbrTargetHeight({
        preference: '1080',
        sourceTier: 1080,
        renditionHeights: [720, 480],
      }),
    ).toBe(720);
    expect(
      resolveAbrLevelIndex({
        preference: '480',
        sourceTier: 720,
        renditionHeights: [720, 480, 360],
      }),
    ).toBe(1);
    expect(
      resolveAbrLevelIndex({
        preference: 'auto',
        sourceTier: 720,
        renditionHeights: [720, 480],
      }),
    ).toBe(-1);
  });
});
