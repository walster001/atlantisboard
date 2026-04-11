import type { ILoginScreenBranding } from '../models/AdminConfig.js';
import type { PublicLoginBranding } from '../../shared/types/loginBranding.js';
import { stripLegacyBrandingFontStacks } from '../../shared/types/customFonts.js';

interface NormalizedLoginBranding {
  backgroundEnabled: boolean;
  backgroundType: 'solid' | 'gradient';
  backgroundColor: string;
  backgroundGradientEnd: string;
  loginBoxStyle: 'box' | 'fullscreen';
  loginBoxBackgroundColor: string;
  googleButtonBackgroundColor: string;
  googleButtonTextColor: string;
  loginInputTitleColor: string;
  loginLinkTitleColor: string;
  loginSignInButtonTextColor: string;
  loginSignInButtonColor: string;
  logoEnabled: boolean;
  logoSizePx: number;
  appNameEnabled: boolean;
  appNameFontFamily: string;
  appNameFontSizePx: number;
  appNameColor: string;
  taglineEnabled: boolean;
  taglineFontFamily: string;
  taglineFontSizePx: number;
  taglineColor: string;
  appName?: string;
  logo?: string;
  tagline?: string;
}

function normalizeBranding(b: Partial<ILoginScreenBranding>): NormalizedLoginBranding {
  const logoRaw = b.logo?.trim();
  const appNameRaw = b.appName?.trim();
  const taglineRaw = b.tagline?.trim();
  return {
    backgroundEnabled: b.backgroundEnabled ?? false,
    backgroundType: b.backgroundType === 'gradient' ? 'gradient' : 'solid',
    backgroundColor: b.backgroundColor ?? '#1f68b5',
    backgroundGradientEnd: b.backgroundGradientEnd ?? '#e7f5ff',
    loginBoxStyle: b.loginBoxStyle === 'fullscreen' ? 'fullscreen' : 'box',
    loginBoxBackgroundColor: b.loginBoxBackgroundColor ?? '#ffffff',
    googleButtonBackgroundColor: b.googleButtonBackgroundColor ?? '#ffffff',
    googleButtonTextColor: b.googleButtonTextColor ?? '#000000',
    loginInputTitleColor: b.loginInputTitleColor ?? '#495057',
    loginLinkTitleColor: b.loginLinkTitleColor ?? '#228be6',
    loginSignInButtonTextColor: b.loginSignInButtonTextColor ?? '#ffffff',
    loginSignInButtonColor: b.loginSignInButtonColor ?? '#228be6',
    logoEnabled: b.logoEnabled ?? false,
    logoSizePx: b.logoSizePx ?? 300,
    appNameEnabled: b.appNameEnabled ?? false,
    appNameFontFamily: stripLegacyBrandingFontStacks(
      b.appNameFontFamily ?? 'system-ui, sans-serif'
    ),
    appNameFontSizePx: b.appNameFontSizePx ?? 44,
    appNameColor: b.appNameColor ?? '#1f68b5',
    taglineEnabled: b.taglineEnabled ?? false,
    taglineFontFamily: stripLegacyBrandingFontStacks(
      b.taglineFontFamily ?? 'system-ui, sans-serif'
    ),
    taglineFontSizePx: b.taglineFontSizePx ?? 20,
    taglineColor: b.taglineColor ?? '#868e96',
    ...(appNameRaw ? { appName: appNameRaw } : {}),
    ...(logoRaw ? { logo: logoRaw } : {}),
    ...(taglineRaw ? { tagline: taglineRaw } : {}),
  };
}

export function toPublicLoginBranding(
  lb: ILoginScreenBranding | undefined | null
): PublicLoginBranding {
  const b = normalizeBranding(lb ?? {});
  const faviconUrl = lb?.faviconUrl?.trim();
  const browserTabTitle = lb?.browserTabTitle?.trim();
  return {
    backgroundEnabled: b.backgroundEnabled,
    backgroundType: b.backgroundType,
    backgroundColor: b.backgroundColor,
    backgroundGradientEnd: b.backgroundGradientEnd,
    loginBoxStyle: b.loginBoxStyle,
    loginBoxBackgroundColor: b.loginBoxBackgroundColor,
    googleButtonBackgroundColor: b.googleButtonBackgroundColor,
    googleButtonTextColor: b.googleButtonTextColor,
    loginInputTitleColor: b.loginInputTitleColor,
    loginLinkTitleColor: b.loginLinkTitleColor,
    loginSignInButtonTextColor: b.loginSignInButtonTextColor,
    loginSignInButtonColor: b.loginSignInButtonColor,
    logoEnabled: b.logoEnabled,
    logoSizePx: b.logoSizePx,
    appNameEnabled: b.appNameEnabled,
    appNameFontFamily: b.appNameFontFamily,
    appNameFontSizePx: b.appNameFontSizePx,
    appNameColor: b.appNameColor,
    taglineEnabled: b.taglineEnabled,
    taglineFontFamily: b.taglineFontFamily,
    taglineFontSizePx: b.taglineFontSizePx,
    taglineColor: b.taglineColor,
    faviconEnabled: lb?.faviconEnabled ?? false,
    browserTabTitleEnabled: lb?.browserTabTitleEnabled ?? false,
    ...(b.logo ? { logo: b.logo } : {}),
    ...(b.appName ? { appName: b.appName } : {}),
    ...(b.tagline ? { tagline: b.tagline } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(browserTabTitle ? { browserTabTitle } : {}),
  };
}
