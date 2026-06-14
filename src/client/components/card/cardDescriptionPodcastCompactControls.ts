import type { ResponsiveTier } from '../../hooks/useResponsiveTier.js';

/** Layout width below which volume/speed use the compact popover control (cover art present). */
export const PODCAST_COMPACT_CONTROLS_MAX_LAYOUT_WIDTH_PX = 420;

export function shouldUseCompactPodcastControls(params: {
  readonly tier: ResponsiveTier;
  readonly layoutWidthPx: number;
  readonly hasCover: boolean;
}): boolean {
  if (params.tier === 'mobile') {
    return true;
  }
  return (
    params.hasCover &&
    params.layoutWidthPx > 0 &&
    params.layoutWidthPx < PODCAST_COMPACT_CONTROLS_MAX_LAYOUT_WIDTH_PX
  );
}
