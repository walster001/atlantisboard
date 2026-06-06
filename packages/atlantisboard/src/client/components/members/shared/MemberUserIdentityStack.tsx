import { memo } from 'react';
import { Group, Stack, Text, Tooltip } from '@mantine/core';
import type { MemberUserRow } from '../../../hooks/members/memberDirectoryUtils.js';
import { ImportPlaceholderBadges } from './ImportPlaceholderBadges.js';

export const MemberUserIdentityStack = memo(function MemberUserIdentityStack(props: {
  readonly user: MemberUserRow;
  readonly compact?: boolean;
  readonly emailClassName?: string;
  readonly showImportBadges?: boolean;
}) {
  const { user, compact = false, emailClassName, showImportBadges = true } = props;
  const email = user.email.trim();
  const emailLine =
    email !== '' ? email : user.importPlaceholder === true ? 'No email in import file' : '';
  return (
    <Stack gap={compact ? 2 : 4} style={{ flex: 1, minWidth: 0 }}>
      <Group gap={6} wrap="wrap" align="center">
        <Text fw={600} size={compact ? 'xs' : 'sm'} lineClamp={compact ? 2 : 1} style={{ flex: 1, minWidth: 0 }}>
          {user.displayName}
        </Text>
        {showImportBadges ? (
          <ImportPlaceholderBadges
            importPlaceholder={user.importPlaceholder}
            importNotMapped={user.importNotMapped}
          />
        ) : null}
      </Group>
      <Tooltip label={emailLine} disabled={emailLine === ''} openDelay={350} position="top-start" multiline maw={420}>
        <Text
          component="span"
          size="xs"
          c="dimmed"
          lineClamp={compact ? 3 : 2}
          {...(emailClassName !== undefined ? { className: emailClassName } : {})}
        >
          {emailLine}
        </Text>
      </Tooltip>
    </Stack>
  );
});
