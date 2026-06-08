import { memo, useMemo, type ReactElement } from 'react';
import { Select, Stack, Table, Text } from '@mantine/core';
import type { ImportSourceRoleMapping, ImportSourceType } from '../../../shared/import/importPreflight.js';
import { formatImportSourceRoleLabel } from '../../../shared/import/importSourceBoardRoles.js';
import type { RoleKey } from '../../../shared/permissions/catalog.js';
import type { ImportRoleSelectOption } from './useImportAssignableRoleOptions.js';

interface ImportRoleMappingTableProps {
  readonly source: ImportSourceType;
  readonly sourceRoles: readonly string[];
  readonly mappings: readonly ImportSourceRoleMapping[];
  readonly onMappingsChange: (next: ImportSourceRoleMapping[]) => void;
  readonly targetRoleOptions: readonly ImportRoleSelectOption[];
}

export const ImportRoleMappingTable = memo(function ImportRoleMappingTable(
  props: ImportRoleMappingTableProps,
): ReactElement {
  const { source, sourceRoles, mappings, onMappingsChange, targetRoleOptions } = props;

  const mappingBySource = new Map(mappings.map((entry) => [entry.sourceRoleKey, entry.targetRoleKey]));

  const selectOptions = useMemo(() => {
    const byValue = new Map<string, ImportRoleSelectOption>();
    for (const option of targetRoleOptions) {
      byValue.set(option.value, option);
    }
    for (const mapping of mappings) {
      if (!byValue.has(mapping.targetRoleKey)) {
        byValue.set(mapping.targetRoleKey, {
          value: mapping.targetRoleKey as RoleKey,
          label: mapping.targetRoleKey,
        });
      }
    }
    return [...byValue.values()];
  }, [mappings, targetRoleOptions]);

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Map source roles to Atlantisboard roles
      </Text>
      <Text size="sm" c="dimmed">
        Placeholder users inherit the mapped Atlantisboard role on this board. Adjust defaults before importing.
      </Text>
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Source role (from file)</Table.Th>
            <Table.Th>Atlantisboard role</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sourceRoles.map((sourceRoleKey) => {
            const targetRoleKey = mappingBySource.get(sourceRoleKey) ?? 'viewer';
            return (
              <Table.Tr key={sourceRoleKey}>
                <Table.Td>{formatImportSourceRoleLabel(source, sourceRoleKey)}</Table.Td>
                <Table.Td>
                  <Select
                    aria-label={`Atlantisboard role for ${sourceRoleKey}`}
                    data={selectOptions}
                    value={targetRoleKey}
                    onChange={(value) => {
                      if (value == null || value.trim() === '') {
                        return;
                      }
                      const next = sourceRoles.map((key) => ({
                        sourceRoleKey: key,
                        targetRoleKey:
                          key === sourceRoleKey ? value : (mappingBySource.get(key) ?? 'viewer'),
                      }));
                      onMappingsChange(next);
                    }}
                    searchable={false}
                    allowDeselect={false}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
});
