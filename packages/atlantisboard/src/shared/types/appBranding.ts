/**
 * Boards homepage / app chrome branding (AdminConfig.appScreenBranding).
 * Safe subset is exposed via GET /auth/app-branding.
 */

import { SYSTEM_UI_FONT_FAMILY } from './customFonts.js';
import type { PublicLoginBranding } from './loginBranding.js';

/** Bundled Poppins + fallbacks (matches legacy global CSS / Mantine). */
export const BUILTIN_APP_UI_FONT_STACK =
  '"Poppins", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' as const;

/** Resolved stack when admin chooses System UI (no Poppins). */
export const SYSTEM_UI_APP_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' as const;

export function resolveAppUiFontStack(stored: string | undefined | null): string {
  const t = stored?.trim() ?? '';
  if (t === '') {
    return BUILTIN_APP_UI_FONT_STACK;
  }
  if (t === SYSTEM_UI_FONT_FAMILY) {
    return SYSTEM_UI_APP_FONT_STACK;
  }
  return t;
}

export const APP_NAVBAR_ICON_SIZE_MIN_PX = 18;
export const APP_NAVBAR_ICON_SIZE_MAX_PX = 75;

export const DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX = 40;
export const DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX = 40;

/** Clamp to the allowed app-branding navbar icon range. */
export function clampAppNavbarIconSizePx(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  const r = Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(
    APP_NAVBAR_ICON_SIZE_MAX_PX,
    Math.max(APP_NAVBAR_ICON_SIZE_MIN_PX, r)
  );
}

export type HomepageBackgroundMode = 'color' | 'image';

/** Editable draft (admin form + API payload). */
export interface AppBrandingDraft {
  homepageNavbarIconUrl?: string;
  /**
   * When there is no custom homepage navbar image: if true, use Login branding favicon when enabled;
   * if false, use the default kanban layout icon.
   */
  homepageNavbarUseLoginFavicon: boolean;
  /** Display size (px) for home nav icon image or default kanban icon. */
  homepageNavbarIconSizePx: number;
  homepageNavbarLabel?: string;
  homepageNavbarLabelInheritAppName: boolean;
  /** Empty string = use theme default (CSS). */
  homepageNavbarTextColor: string;
  /** Empty string = use default white nav strip. */
  homepageNavbarColor: string;
  homepageBackgroundMode: HomepageBackgroundMode;
  homepageBackgroundColor: string;
  homepageBackgroundImageUrl?: string;
  boardNavbarIconUrl?: string;
  boardNavbarIconSameAsHomepage: boolean;
  /** Display size (px) for board header brand image or default kanban layout icon. */
  boardNavbarIconSizePx: number;
  /** Omitted or empty in API = built-in Poppins stack. */
  defaultUiFontFamily?: string;
}

export interface PublicAppBranding {
  readonly homepageNavbarIconUrl?: string;
  readonly homepageNavbarUseLoginFavicon: boolean;
  readonly homepageNavbarIconSizePx: number;
  readonly homepageNavbarLabel?: string;
  readonly homepageNavbarLabelInheritAppName: boolean;
  readonly homepageNavbarTextColor: string;
  readonly homepageNavbarColor: string;
  readonly homepageBackgroundMode: HomepageBackgroundMode;
  readonly homepageBackgroundColor: string;
  readonly homepageBackgroundImageUrl?: string;
  readonly boardNavbarIconUrl?: string;
  readonly boardNavbarIconSameAsHomepage: boolean;
  readonly boardNavbarIconSizePx: number;
  readonly defaultUiFontFamily?: string;
}

export const DEFAULT_APP_BRANDING_DRAFT: AppBrandingDraft = {
  homepageNavbarUseLoginFavicon: true,
  homepageNavbarIconSizePx: DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX,
  homepageNavbarLabelInheritAppName: false,
  homepageNavbarTextColor: '#212529',
  homepageNavbarColor: '#ffffff',
  homepageBackgroundMode: 'color',
  homepageBackgroundColor: '#f8f9fa',
  boardNavbarIconSameAsHomepage: false,
  boardNavbarIconSizePx: DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX,
};

export function mergePublicAppBranding(
  partial: Partial<PublicAppBranding> | null | undefined
): AppBrandingDraft {
  const p = partial ?? {};
  return {
    ...DEFAULT_APP_BRANDING_DRAFT,
    ...p,
    homepageNavbarIconSizePx: clampAppNavbarIconSizePx(
      p.homepageNavbarIconSizePx,
      DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX
    ),
    boardNavbarIconSizePx: clampAppNavbarIconSizePx(
      p.boardNavbarIconSizePx,
      DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX
    ),
  };
}

/**
 * Factory defaults for admin reset: clears optional URLs/strings; booleans off.
 */
export function getDefaultAppScreenBrandingForReset(): AppBrandingDraft & {
  homepageNavbarIconUrl: string;
  homepageNavbarLabel: string;
  homepageBackgroundImageUrl: string;
  boardNavbarIconUrl: string;
} {
  return {
    ...DEFAULT_APP_BRANDING_DRAFT,
    homepageNavbarIconUrl: '',
    homepageNavbarLabel: '',
    homepageBackgroundImageUrl: '',
    boardNavbarIconUrl: '',
  };
}

/** Navbar brand text: inherit uses login app name when enabled; otherwise custom label or fallback. */
export function resolveHomepageNavbarLabelText(
  app: Pick<PublicAppBranding, 'homepageNavbarLabelInheritAppName' | 'homepageNavbarLabel'>,
  login: Pick<PublicLoginBranding, 'appNameEnabled' | 'appName'>
): string {
  if (app.homepageNavbarLabelInheritAppName) {
    if (login.appNameEnabled && login.appName?.trim()) {
      return login.appName.trim();
    }
    return 'KanBoard';
  }
  const custom = app.homepageNavbarLabel?.trim();
  if (custom) {
    return custom;
  }
  return 'KanBoard';
}

/** Image URL for the home nav icon, or `null` to use the default Tabler kanban icon. */
export function resolveHomepageNavbarIconUrl(
  app: Pick<
    PublicAppBranding,
    | 'homepageNavbarIconUrl'
    | 'homepageNavbarUseLoginFavicon'
  >,
  login: Pick<PublicLoginBranding, 'faviconEnabled' | 'faviconUrl'>
): string | null {
  const custom = app.homepageNavbarIconUrl?.trim();
  if (custom) {
    return custom;
  }
  if (
    app.homepageNavbarUseLoginFavicon &&
    login.faviconEnabled &&
    login.faviconUrl?.trim()
  ) {
    return login.faviconUrl.trim();
  }
  return null;
}

export function resolveBoardNavbarIconUrl(
  app: PublicAppBranding,
  login: Pick<PublicLoginBranding, 'faviconEnabled' | 'faviconUrl'>
): string | null {
  if (app.boardNavbarIconSameAsHomepage) {
    return resolveHomepageNavbarIconUrl(app, login);
  }
  const board = app.boardNavbarIconUrl?.trim();
  return board || null;
}
