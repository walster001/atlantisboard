import type { VideoQualityPreference, VideoRenditionHeight } from './videoQuality.js';
import { isVideoRenditionHeight, pickVideoPlaybackHeight } from './videoQuality.js';

export type VideoAbrFormat = 'hls' | 'dash';

export interface VideoAbrStreamingMeta {
  readonly ready: boolean;
  readonly hlsManifestUrl: string | null;
  readonly dashManifestUrl: string | null;
  /** Heights packaged in the ABR ladder (descending). */
  readonly renditionHeights: readonly VideoRenditionHeight[];
}

/** API-relative stream URL for an ABR manifest or segment. */
export function buildVideoAbrStreamPath(
  attachmentId: string,
  format: VideoAbrFormat,
  relativePath: string,
): string {
  const safeId = encodeURIComponent(attachmentId);
  const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
  return `/api/v1/attachments/${safeId}/stream/${format}?path=${encodeURIComponent(normalized)}`;
}

export function defaultVideoAbrManifestPath(format: VideoAbrFormat): string {
  return format === 'hls' ? 'hls/master.m3u8' : 'dash/manifest.mpd';
}

export function buildVideoAbrManifestUrls(attachmentId: string): {
  readonly hlsManifestUrl: string;
  readonly dashManifestUrl: string;
} {
  return {
    hlsManifestUrl: buildVideoAbrStreamPath(attachmentId, 'hls', defaultVideoAbrManifestPath('hls')),
    dashManifestUrl: buildVideoAbrStreamPath(attachmentId, 'dash', defaultVideoAbrManifestPath('dash')),
  };
}

/** Guess Content-Type for proxied ABR objects. */
export function videoAbrObjectContentType(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  }
  if (lower.endsWith('.mpd')) {
    return 'application/dash+xml';
  }
  if (lower.endsWith('.ts')) {
    return 'video/mp2t';
  }
  if (lower.endsWith('.m4s') || lower.endsWith('.mp4')) {
    return 'video/mp4';
  }
  return 'application/octet-stream';
}

/**
 * Map UI quality preference to an ABR rendition height (auto → capped source tier).
 * Returns null when no packaged rendition matches.
 */
export function resolveAbrTargetHeight(args: {
  readonly preference: VideoQualityPreference;
  readonly sourceTier: VideoRenditionHeight | null;
  readonly renditionHeights: readonly number[];
}): VideoRenditionHeight | null {
  const target = pickVideoPlaybackHeight({
    preference: args.preference,
    sourceTier: args.sourceTier,
  });
  if (target == null) {
    return null;
  }
  if (!args.renditionHeights.includes(target)) {
    const capped = args.renditionHeights.find((height) => height <= target);
    return capped != null && isVideoRenditionHeight(capped) ? capped : null;
  }
  return target;
}

/** Index into a descending rendition list for manual quality (-1 = auto). */
export function resolveAbrLevelIndex(args: {
  readonly preference: VideoQualityPreference;
  readonly sourceTier: VideoRenditionHeight | null;
  readonly renditionHeights: readonly number[];
}): number {
  if (args.preference === 'auto') {
    return -1;
  }
  const target = resolveAbrTargetHeight(args);
  if (target == null) {
    return -1;
  }
  const index = args.renditionHeights.indexOf(target);
  return index >= 0 ? index : -1;
}

/** Prefer native HLS on Apple platforms; DASH elsewhere. */
export function pickVideoAbrFormatForUserAgent(userAgent: string): VideoAbrFormat {
  const ua = userAgent.toLowerCase();
  const isApple =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('macintosh') && ua.includes('version/') && ua.includes('safari'));
  return isApple ? 'hls' : 'dash';
}
