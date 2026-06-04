import { Box, SimpleGrid, Stack, Text } from '@mantine/core';
import { type ReactElement } from 'react';
import {
  countPasswordStrengthSatisfied,
  getPasswordStrengthSegments,
} from '../../../shared/utils/passwordStrength.js';

export function PasswordStrengthMeter({
  password,
  labelColor,
}: {
  readonly password: string;
  /** Login branding: match dimmed label color on custom backgrounds */
  readonly labelColor?: string;
}): ReactElement {
  const segments = getPasswordStrengthSegments(password);
  const n = countPasswordStrengthSatisfied(password);
  const strengthLabel =
    password.length === 0
      ? 'Password requirements'
      : n <= 2
        ? 'Weak'
        : n <= 4
          ? 'Fair'
          : 'Strong';

  const strengthTextProps =
    labelColor != null && labelColor !== ''
      ? { size: 'xs' as const, style: { color: labelColor } }
      : { size: 'xs' as const, c: 'dimmed' as const };

  return (
    <Stack gap={6} mt={6} aria-live="polite">
      <Text {...strengthTextProps}>
        {strengthLabel}
      </Text>
      <SimpleGrid
        cols={segments.length}
        spacing={6}
        verticalSpacing={0}
        role="presentation"
        aria-hidden
      >
        {segments.map((s, i) => (
          <Box
            key={s.id}
            h={4}
            miw={0}
            style={{
              borderRadius: 'var(--mantine-radius-xs)',
              backgroundColor:
                i < n ? 'var(--mantine-color-teal-filled)' : 'var(--mantine-color-gray-4)',
              transition: 'background-color 120ms ease',
            }}
          />
        ))}
      </SimpleGrid>
      <Text component="div" {...strengthTextProps}>
        {segments.map((s) => (
          <div key={s.id}>
            {s.satisfied ? '✓' : '○'} {s.label}
          </div>
        ))}
      </Text>
    </Stack>
  );
}
