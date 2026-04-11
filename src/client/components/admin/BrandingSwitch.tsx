import type { ReactElement } from 'react';
import { Switch, type SwitchProps } from '@mantine/core';

/**
 * Login-branding toggles: normal sliding thumb, without Mantine’s inner dot
 * inside the thumb (`withThumbIndicator`).
 */
export function BrandingSwitch({
  styles: userStyles,
  withThumbIndicator = false,
  ...rest
}: SwitchProps): ReactElement {
  if (userStyles === undefined) {
    return <Switch {...rest} withThumbIndicator={withThumbIndicator} />;
  }

  const mergedStyles: NonNullable<SwitchProps['styles']> =
    typeof userStyles === 'function'
      ? (theme, props, ctx) => {
          const s = userStyles(theme, props, ctx);
          return {
            ...s,
            track: { cursor: 'pointer', ...s.track },
          };
        }
      : {
          ...userStyles,
          track: { cursor: 'pointer', ...userStyles.track },
        };

  return (
    <Switch
      {...rest}
      withThumbIndicator={withThumbIndicator}
      styles={mergedStyles}
    />
  );
}
