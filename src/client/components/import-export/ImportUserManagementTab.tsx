import { memo, type ReactElement } from 'react';
import { Alert, Radio, Stack, Text } from '@mantine/core';
import type {
  ImportPreflightResult,
  ImportSourceRoleMapping,
} from '../../../shared/import/importPreflight.js';
import { ImportRoleMappingTable } from './ImportRoleMappingTable.js';
import type { ImportRoleSelectOption } from './useImportAssignableRoleOptions.js';

interface ImportUserManagementTabProps {
  readonly preflight: ImportPreflightResult | null;
  readonly importUsersAsPlaceholders: boolean;
  readonly onImportUsersAsPlaceholdersChange: (value: boolean) => void;
  readonly sourceRoleMappings: readonly ImportSourceRoleMapping[];
  readonly onSourceRoleMappingsChange: (next: ImportSourceRoleMapping[]) => void;
  readonly targetRoleOptions: readonly ImportRoleSelectOption[];
}

export const ImportUserManagementTab = memo(function ImportUserManagementTab(
  props: ImportUserManagementTabProps,
): ReactElement {
  const {
    preflight,
    importUsersAsPlaceholders,
    onImportUsersAsPlaceholdersChange,
    sourceRoleMappings,
    onSourceRoleMappingsChange,
    targetRoleOptions,
  } = props;
  const userCount = preflight?.users.users.length ?? 0;
  const sourceRoles = preflight?.sourceBoardRoles.roles ?? [];

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Choose whether to create placeholder accounts for people in the import file who are not already registered
        on this server. Placeholders appear on the imported board&apos;s settings → Users tab with{' '}
        <strong>Imported</strong> and <strong>Not Mapped</strong> labels until someone signs in with Google or a local
        account using the same email as in the Wekan file (Wekan often stores that address in the{' '}
        <code>username</code> field).
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
        <>
          <Alert color="blue" radius="md">
            {userCount > 0 ? (
              <>
                Up to <strong>{userCount}</strong> identities from the file can become placeholders when they do not
                match an existing account. Map source roles below so placeholders receive the correct board permissions
                when they sign in.
              </>
            ) : (
              <>No user records were found in this file. Board members may still be inferred from card assignees.</>
            )}
          </Alert>
          {sourceRoles.length > 0 ? (
            <ImportRoleMappingTable
              source={preflight?.source ?? 'wekan'}
              sourceRoles={sourceRoles}
              mappings={sourceRoleMappings}
              onMappingsChange={onSourceRoleMappingsChange}
              targetRoleOptions={targetRoleOptions}
            />
          ) : null}
        </>
      ) : (
        <Alert color="gray" radius="md">
          Unmatched users from the file will not be added to board membership. Card assignees and comments may fall
          back to you as the importer where needed.
        </Alert>
      )}
    </Stack>
  );
});
