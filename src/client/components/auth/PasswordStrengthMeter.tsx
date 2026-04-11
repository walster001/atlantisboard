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

  return (
    <Stack gap={6} mt={6} aria-live="polite">
      <Text
        size="xs"
        c="dimmed"
        {...(labelColor ? { style: { color: labelColor } } : {})}
      >
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
      <Text
        component="div"
        size="xs"
        c="dimmed"
        {...(labelColor ? { style: { color: labelColor } } : {})}
      >
        {segments.map((s) => (
          <div key={s.id}>
            {s.satisfied ? '✓' : '○'} {s.label}
          </div>
        ))}
      </Text>
    </Stack>
  );
}
