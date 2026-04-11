import { Progress, Stack, Text } from '@mantine/core';
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
  const sectionValue = 100 / segments.length;
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
      <Progress.Root size="sm" radius="xs">
        {segments.map((s) => (
          <Progress.Section
            key={s.id}
            value={sectionValue}
            color={s.satisfied ? 'teal' : 'gray.4'}
          />
        ))}
      </Progress.Root>
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
