import type { ColorInputProps } from '@mantine/core';

/**
 * Matches admin login branding colour fields (`LoginBrandingSection` → Mantine `ColorInput`).
 * Spread onto `ColorInput` for visual consistency outside the admin screen.
 */
export const loginBrandingColorInputProps = {
  format: 'hex',
  radius: 'md',
} as const satisfies Pick<ColorInputProps, 'format' | 'radius'>;
