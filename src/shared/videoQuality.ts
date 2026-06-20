import type { VideoAbrStreamingMeta } from './videoStreaming.js';

/** Standard video playback tiers (descending). */
export const VIDEO_RENDITION_HEIGHTS = [1080, 720, 480, 360] as const;

export type VideoRenditionHeight = (typeof VIDEO_RENDITION_HEIGHTS)[number];

export type VideoQualityPreference = 'auto' | `${VideoRenditionHeight}`;

export interface VideoAttachmentQualityMeta {
  readonly sourceHeight: number | null;
  readonly sourceTier: VideoRenditionHeight | null;
  /** Tiers at or below the source — used to label manual quality options. */
  readonly availableHeights: readonly VideoRenditionHeight[];
  /** False when the server is below the ABR vCPU threshold (progressive stream only). */
  readonly abrEnabled: boolean;
  readonly streaming: VideoAbrStreamingMeta;
}

export function isVideoRenditionHeight(value: number): value is VideoRenditionHeight {
  return (VIDEO_RENDITION_HEIGHTS as readonly number[]).includes(value);
}

export function parseVideoQualityPreference(raw: string | undefined): VideoQualityPreference | null {
  const trimmed = raw?.trim().toLowerCase();
  if (trimmed == null || trimmed === '') {
    return null;
  }
  if (trimmed === 'auto') {
    return 'auto';
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsed) && isVideoRenditionHeight(parsed)) {
    return `${parsed}` as VideoQualityPreference;
  }
  return null;
}

/** Highest standard tier that does not exceed the source pixel height. */
export function mapSourceHeightToTier(sourceHeight: number): VideoRenditionHeight | null {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    return null;
  }
  for (const tier of VIDEO_RENDITION_HEIGHTS) {
    if (sourceHeight >= tier) {
      return tier;
    }
  }
  return null;
}

/** Standard tiers that do not exceed the source tier (descending). */
export function buildAvailableVideoHeights(
  sourceTier: VideoRenditionHeight | null,
): readonly VideoRenditionHeight[] {
  if (sourceTier == null) {
    return VIDEO_RENDITION_HEIGHTS;
  }
  return VIDEO_RENDITION_HEIGHTS.filter((height) => sourceTier >= height);
}

/**
 * Resolves the active playback tier for quality UI labels.
 * Auto: source tier (or null when unknown). Manual: requested tier capped by source tier.
 */
export function pickVideoPlaybackHeight(args: {
  readonly preference: VideoQualityPreference;
  readonly sourceTier: VideoRenditionHeight | null;
}): VideoRenditionHeight | null {
  if (args.preference === 'auto') {
    return args.sourceTier;
  }
  const requested = Number.parseInt(args.preference, 10);
  if (!isVideoRenditionHeight(requested)) {
    return null;
  }
  if (args.sourceTier != null && requested > args.sourceTier) {
    return args.sourceTier;
  }
  return requested;
}

export function videoQualityPreferenceLabel(preference: VideoQualityPreference): string {
  return preference === 'auto' ? 'Auto' : `${preference}p`;
}

export function buildVideoAttachmentQualityMeta(args: {
  readonly sourceHeight: number | null | undefined;
  readonly streaming?: VideoAbrStreamingMeta;
  readonly abrEnabled?: boolean;
}): VideoAttachmentQualityMeta {
  const sourceHeight = args.sourceHeight ?? null;
  const sourceTier =
    sourceHeight != null && Number.isFinite(sourceHeight) ? mapSourceHeightToTier(sourceHeight) : null;
  const streaming = args.streaming ?? {
    ready: false,
    hlsManifestUrl: null,
    dashManifestUrl: null,
    renditionHeights: buildAvailableVideoHeights(sourceTier),
  };
  return {
    sourceHeight,
    sourceTier,
    availableHeights: buildAvailableVideoHeights(sourceTier),
    abrEnabled: args.abrEnabled === true,
    streaming,
  };
}
