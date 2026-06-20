import { VIDEO_RENDITION_HEIGHTS, type VideoRenditionHeight } from '../../../shared/videoQuality.js';

export const VIDEO_ABR_HLS_MASTER = 'hls/master.m3u8';
export const VIDEO_ABR_DASH_MANIFEST = 'dash/manifest.mpd';

/** MinIO prefix for segmented ABR output beside the source object. */
export function videoAbrStoragePrefix(sourceObjectName: string): string {
  const trimmed = sourceObjectName.trim().replace(/\\/g, '/');
  const slash = trimmed.lastIndexOf('/');
  const dir = slash >= 0 ? trimmed.slice(0, slash) : '';
  const file = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const stem = file.replace(/\.[^./]+$/, '');
  return dir.length > 0 ? `${dir}/${stem}/abr` : `${stem}/abr`;
}

export function videoAbrObjectKey(sourceObjectName: string, relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
  return `${videoAbrStoragePrefix(sourceObjectName)}/${normalized}`;
}

export function videoAbrHlsMasterObjectKey(sourceObjectName: string): string {
  return videoAbrObjectKey(sourceObjectName, VIDEO_ABR_HLS_MASTER);
}

export function videoAbrDashManifestObjectKey(sourceObjectName: string): string {
  return videoAbrObjectKey(sourceObjectName, VIDEO_ABR_DASH_MANIFEST);
}

/** Standard tiers at or below source height (or full ladder when unknown). */
export function selectVideoAbrRenditionHeights(sourceHeight: number | null): readonly VideoRenditionHeight[] {
  if (sourceHeight == null || !Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    return VIDEO_RENDITION_HEIGHTS;
  }
  return VIDEO_RENDITION_HEIGHTS.filter((height) => sourceHeight >= height);
}
