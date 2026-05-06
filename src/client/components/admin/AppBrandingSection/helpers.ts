import {
  APP_NAVBAR_ICON_SIZE_MAX_PX,
  APP_NAVBAR_ICON_SIZE_MIN_PX,
  mergePublicAppBranding,
  type AppBrandingDraft,
  type HomepageBackgroundMode,
  type PublicAppBranding,
} from '../../../../shared/types/appBranding.js';

export const BG_MODE_SEGMENTS: { value: HomepageBackgroundMode; label: string }[] = [
  { value: 'color', label: 'Background color' },
  { value: 'image', label: 'Background image' },
];

export const NAV_ICON_SIZE_SELECT_DATA: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let px = APP_NAVBAR_ICON_SIZE_MIN_PX; px <= APP_NAVBAR_ICON_SIZE_MAX_PX; px += 1) {
    out.push({ value: String(px), label: `${px}px` });
  }
  return out;
})();

export type UploadSlot = 'home-nav-icon' | 'home-bg-image' | 'board-nav-icon';

export type AppBrandingHandlers = {
  readonly setHomepageNavbarUseLoginFavicon: (v: boolean) => void;
  readonly setHomepageNavbarIconSizePx: (v: string | null) => void;
  readonly setBoardNavbarIconSizePx: (v: string | null) => void;
  readonly setHomepageNavbarLabel: (v: string) => void;
  readonly setHomepageNavbarLabelInheritAppName: (v: boolean) => void;
  readonly setHomepageNavbarTextColor: (c: string) => void;
  readonly setHomepageNavbarColor: (c: string) => void;
  readonly setHomepageBackgroundMode: (v: HomepageBackgroundMode) => void;
  readonly setHomepageBackgroundColor: (c: string) => void;
  readonly setBoardNavbarIconSameAsHomepage: (v: boolean) => void;
};

export function draftToPublicPreview(draft: AppBrandingDraft): PublicAppBranding {
  return mergePublicAppBranding(draft) as unknown as PublicAppBranding;
}
