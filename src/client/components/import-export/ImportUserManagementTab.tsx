import { memo, type ReactElement } from 'react';
import { Alert, Radio, Stack, Text } from '@mantine/core';
import type { ImportPreflightResult } from '../../../shared/import/importPreflight.js';

interface ImportUserManagementTabProps {
  readonly preflight: ImportPreflightResult | null;
  readonly importUsersAsPlaceholders: boolean;
  readonly onImportUsersAsPlaceholdersChange: (value: boolean) => void;
}

export const ImportUserManagementTab = memo(function ImportUserManagementTab(
  props: ImportUserManagementTabProps,
): ReactElement {
  const { preflight, importUsersAsPlaceholders, onImportUsersAsPlaceholdersChange } = props;
  const userCount = preflight?.users.users.length ?? 0;

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Choose whether to create placeholder accounts for people in the import file who are not already registered
        on this server. Placeholders appear on the imported board&apos;s settings → Users tab with{' '}
        <strong>Imported</strong> and <strong>Not Mapped</strong> labels until someone signs in with a matching email
        or username.
      </Text>

      <Radio.Group
        label="Import users from board file and create placeholders?"
        value={importUsersAsPlaceholders ? 'yes' : 'no'}
        onChange={(value) => {
          onImportUsersAsPlaceholdersChange(value === 'yes');
        }}
      >
        <Stack gap="xs" mt="xs">
          <Radio value="no" label="No" />
          <Radio value="yes" label="Yes" />
        </Stack>
      </Radio.Group>

      {importUsersAsPlaceholders ? (
        <Alert color="blue" radius="md">
          {userCount > 0 ? (
            <>
              Up to <strong>{userCount}</strong> identities from the file can become placeholders when they do not
              match an existing account. Wekan/Trello roles are mapped to Atlantis board roles (admin → manager,
              read-only/comment-only → viewer).
            </>
          ) : (
            <>No user records were found in this file. Board members may still be inferred from card assignees.</>
          )}
        </Alert>
      ) : (
        <Alert color="gray" radius="md">
          Unmatched users from the file will not be added to board membership. Card assignees and comments may fall
          back to you as the importer where needed.
        </Alert>
      )}
    </Stack>
  );
});
