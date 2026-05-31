import {
  mergePublicLoginBranding,
  type PublicLoginBranding,
} from '../../shared/types/loginBranding.js';
import {
  mergePublicAppBranding,
  type AppBrandingDraft,
  type PublicAppBranding,
} from '../../shared/types/appBranding.js';

/** Draft merge result is structurally compatible with the public readonly branding type. */
export function toPublicLoginBranding(
  partial: Partial<PublicLoginBranding> | null | undefined,
): PublicLoginBranding {
  return mergePublicLoginBranding(partial) as PublicLoginBranding;
}

export function toPublicAppBranding(
  partial: Partial<PublicAppBranding> | AppBrandingDraft | null | undefined,
): PublicAppBranding {
  return mergePublicAppBranding(partial) as PublicAppBranding;
}
