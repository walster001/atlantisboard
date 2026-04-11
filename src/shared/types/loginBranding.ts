/**
 * Public login screen branding (safe for unauthenticated clients).
 * Mirrors AdminConfig.loginScreenBranding subset.
 */
export type LoginBoxStyle = 'box' | 'fullscreen';

/** Editable draft (admin form + API payload). */
export interface LoginBrandingDraft {
  backgroundEnabled: boolean;
  backgroundType: 'solid' | 'gradient';
  backgroundColor: string;
  backgroundGradientEnd: string;
  loginBoxStyle: LoginBoxStyle;
  loginBoxBackgroundColor: string;
  googleButtonBackgroundColor: string;
  googleButtonTextColor: string;
  loginInputTitleColor: string;
  loginLinkTitleColor: string;
  loginSignInButtonTextColor: string;
  loginSignInButtonColor: string;
  logoEnabled: boolean;
  logo?: string;
  logoSizePx: number;
  appNameEnabled: boolean;
  appName?: string;
  appNameFontFamily: string;
  appNameFontSizePx: number;
  appNameColor: string;
  taglineEnabled: boolean;
  tagline?: string;
  taglineFontFamily: string;
  taglineFontSizePx: number;
  taglineColor: string;
  faviconEnabled: boolean;
  faviconUrl?: string;
  browserTabTitleEnabled: boolean;
  browserTabTitle?: string;
}

export interface PublicLoginBranding {
  readonly backgroundEnabled: boolean;
  readonly backgroundType: 'solid' | 'gradient';
  readonly backgroundColor: string;
  readonly backgroundGradientEnd: string;
  readonly loginBoxStyle: LoginBoxStyle;
  readonly loginBoxBackgroundColor: string;
  readonly googleButtonBackgroundColor: string;
  readonly googleButtonTextColor: string;
  readonly loginInputTitleColor: string;
  readonly loginLinkTitleColor: string;
  readonly loginSignInButtonTextColor: string;
  readonly loginSignInButtonColor: string;
  readonly logoEnabled: boolean;
  readonly logo?: string;
  readonly logoSizePx: number;
  readonly appNameEnabled: boolean;
  readonly appName?: string;
  readonly appNameFontFamily: string;
  readonly appNameFontSizePx: number;
  readonly appNameColor: string;
  readonly taglineEnabled: boolean;
  readonly tagline?: string;
  readonly taglineFontFamily: string;
  readonly taglineFontSizePx: number;
  readonly taglineColor: string;
  readonly faviconEnabled: boolean;
  readonly faviconUrl?: string;
  readonly browserTabTitleEnabled: boolean;
  readonly browserTabTitle?: string;
}

export const DEFAULT_LOGIN_BRANDING_DRAFT: LoginBrandingDraft = {
  backgroundEnabled: false,
  backgroundType: 'solid',
  backgroundColor: '#1f68b5',
  backgroundGradientEnd: '#e7f5ff',
  loginBoxStyle: 'box',
  loginBoxBackgroundColor: '#ffffff',
  googleButtonBackgroundColor: '#ffffff',
  googleButtonTextColor: '#000000',
  loginInputTitleColor: '#495057',
  loginLinkTitleColor: '#228be6',
  loginSignInButtonTextColor: '#ffffff',
  loginSignInButtonColor: '#228be6',
  logoEnabled: false,
  logoSizePx: 300,
  appNameEnabled: false,
  appNameFontFamily: 'system-ui, sans-serif',
  appNameFontSizePx: 44,
  appNameColor: '#1f68b5',
  taglineEnabled: false,
  taglineFontFamily: 'system-ui, sans-serif',
  taglineFontSizePx: 20,
  taglineColor: '#868e96',
  faviconEnabled: false,
  browserTabTitleEnabled: false,
};

export function mergePublicLoginBranding(
  partial: Partial<PublicLoginBranding> | null | undefined
): LoginBrandingDraft {
  return {
    ...DEFAULT_LOGIN_BRANDING_DRAFT,
    ...(partial ?? {}),
  };
}

/**
 * Full `loginScreenBranding` body for admin reset. Spreads factory defaults and clears optional
 * strings so merged config overwrites prior logo, favicon, and text in MongoDB.
 */
export function getDefaultLoginScreenBrandingForReset(): LoginBrandingDraft & {
  logo: string;
  faviconUrl: string;
  appName: string;
  tagline: string;
  browserTabTitle: string;
} {
  return {
    ...DEFAULT_LOGIN_BRANDING_DRAFT,
    logo: '',
    faviconUrl: '',
    appName: '',
    tagline: '',
    browserTabTitle: '',
  };
}

export const LOGIN_LOGO_SIZE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '80', label: 'Small (80px)' },
  { value: '150', label: 'Medium (150px)' },
  { value: '300', label: 'Large (300px)' },
] as const;
