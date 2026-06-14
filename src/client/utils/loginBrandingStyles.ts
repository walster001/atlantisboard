import type { CSSProperties } from 'react';
import type { PublicLoginBranding } from '../../shared/types/loginBranding.js';
import { toPublicLoginBranding } from './brandingPublicTypes.js';

function resolveLoginBranding(
  branding: PublicLoginBranding | null | undefined,
): PublicLoginBranding {
  return toPublicLoginBranding(branding);
}

export function getLoginPageBackgroundStyle(
  branding: PublicLoginBranding | null | undefined,
): CSSProperties {
  const resolved = resolveLoginBranding(branding);
  if (!resolved.backgroundEnabled) {
    return { backgroundColor: 'var(--mantine-color-gray-0)' };
  }
  if (resolved.backgroundType === 'gradient') {
    return {
      background: `linear-gradient(135deg, ${resolved.backgroundColor} 0%, ${resolved.backgroundGradientEnd} 100%)`,
    };
  }
  return { backgroundColor: resolved.backgroundColor };
}

export function getLoginSignInButtonStyles(
  branding: PublicLoginBranding | null | undefined,
) {
  const resolved = resolveLoginBranding(branding);
  return {
    root: {
      backgroundColor: resolved.loginSignInButtonColor,
      color: resolved.loginSignInButtonTextColor,
      border: 'none',
      boxShadow: 'none',
    },
  } as const;
}
