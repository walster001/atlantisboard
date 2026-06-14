import { describe, expect, it } from 'bun:test';
import {
  PODCAST_COMPACT_CONTROLS_MAX_LAYOUT_WIDTH_PX,
  shouldUseCompactPodcastControls,
} from '../src/client/components/card/cardDescriptionPodcastCompactControls.js';

describe('cardDescriptionPodcastCompactControls', () => {
  it('uses compact controls on mobile regardless of cover art', () => {
    expect(
      shouldUseCompactPodcastControls({
        tier: 'mobile',
        layoutWidthPx: 800,
        hasCover: false,
      }),
    ).toBe(true);
  });

  it('uses compact controls on narrow layouts when cover art is shown', () => {
    expect(
      shouldUseCompactPodcastControls({
        tier: 'desktop',
        layoutWidthPx: PODCAST_COMPACT_CONTROLS_MAX_LAYOUT_WIDTH_PX - 1,
        hasCover: true,
      }),
    ).toBe(true);
  });

  it('keeps desktop horizontal slider on wide layouts without cover art', () => {
    expect(
      shouldUseCompactPodcastControls({
        tier: 'desktop',
        layoutWidthPx: 640,
        hasCover: false,
      }),
    ).toBe(false);
  });

  it('keeps desktop horizontal slider on wide layouts with cover art', () => {
    expect(
      shouldUseCompactPodcastControls({
        tier: 'tablet',
        layoutWidthPx: PODCAST_COMPACT_CONTROLS_MAX_LAYOUT_WIDTH_PX,
        hasCover: true,
      }),
    ).toBe(false);
  });
});
