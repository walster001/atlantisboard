import { stripLegacyBrandingFontStacks } from '../../../../shared/types/customFonts.js';
import type { LoginBrandingDraft } from '../../../../shared/types/loginBranding.js';

export function migrateLegacyBranding(
  loginBranding: Record<string, unknown> | undefined,
  draft: LoginBrandingDraft,
): LoginBrandingDraft {
  const next = { ...draft };
  if (
    typeof loginBranding?.appName === 'string' &&
    loginBranding.appName.length > 0 &&
    loginBranding.appNameEnabled === undefined
  ) {
    next.appNameEnabled = true;
  }
  if (
    typeof loginBranding?.logo === 'string' &&
    loginBranding.logo.length > 0 &&
    loginBranding.logoEnabled === undefined
  ) {
    next.logoEnabled = true;
  }
  if (
    typeof loginBranding?.tagline === 'string' &&
    loginBranding.tagline.length > 0 &&
    loginBranding.taglineEnabled === undefined
  ) {
    next.taglineEnabled = true;
  }
  next.appNameFontFamily = stripLegacyBrandingFontStacks(next.appNameFontFamily);
  next.taglineFontFamily = stripLegacyBrandingFontStacks(next.taglineFontFamily);
  return next;
}
