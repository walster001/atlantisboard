import { Box, Button, Group, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import type { ReactElement } from 'react';
import { BUILTIN_ROLE_DESCRIPTIONS, BUILTIN_ROLE_ORDER } from './roleDefinitions.js';
import type { RoleRow } from './types.js';

interface RoleEditorFormProps {
  readonly activeRole: RoleRow;
  readonly activeIsDirty: boolean;
  readonly draftHierarchyLevels: Readonly<Record<string, number>>;
  readonly setHierarchyDraft: (roleKey: string, value: number) => void;
  readonly parseHierarchy: (value: string, fallback: number) => number;
  readonly saveActiveRole: () => Promise<void>;
  readonly deleteActiveRole: () => Promise<void>;
  readonly savingKey: string | null;
  readonly layout: 'stack' | 'toolbar';
}

function roleDescriptionText(activeRole: RoleRow): string | undefined {
  if (activeRole.description != null) {
    return activeRole.description;
  }
  if (activeRole.isBuiltIn && activeRole.key in BUILTIN_ROLE_DESCRIPTIONS) {
    return BUILTIN_ROLE_DESCRIPTIONS[activeRole.key as (typeof BUILTIN_ROLE_ORDER)[number]];
  }
  return undefined;
}

export function RoleEditorForm({
  activeRole,
  activeIsDirty,
  draftHierarchyLevels,
  setHierarchyDraft,
  parseHierarchy,
  saveActiveRole,
  deleteActiveRole,
  savingKey,
  layout,
}: RoleEditorFormProps): ReactElement {
  const description = roleDescriptionText(activeRole);
  const statusLabel = activeRole.isBuiltIn ? (
    <Text size="sm" c="dimmed" fw={600}>
      Read-only
    </Text>
  ) : activeIsDirty ? (
    <Text size="sm" c="orange" fw={600}>
      Unsaved changes
    </Text>
  ) : (
    <Text size="sm" c="green" fw={600}>
      Editable
    </Text>
  );

  const hierarchyInput = (
    <Tooltip
      label="Higher hierarchy number means higher role level. Users cannot assign or promote to roles above their allowed hierarchy/mode."
      multiline
      maw={420}
      openDelay={150}
      position="bottom-start"
    >
      <Box mt={10} {...(layout === 'toolbar' ? { maw: 220 } : {})}>
        <TextInput
          size="sm"
          label="Hierarchy"
          value={String(draftHierarchyLevels[activeRole.key] ?? activeRole.hierarchyLevel)}
          inputMode="numeric"
          pattern="[0-9]*"
          onChange={(event) => {
            const next = parseHierarchy(event.currentTarget.value, activeRole.hierarchyLevel);
            setHierarchyDraft(activeRole.key, next);
          }}
        />
      </Box>
    </Tooltip>
  );

  const actions = (
    <Group gap="xs" wrap="wrap">
      <Button
        size="sm"
        onClick={() => void saveActiveRole()}
        disabled={!activeIsDirty}
        loading={savingKey === activeRole.key}
      >
        Save changes
      </Button>
      {!activeRole.isBuiltIn ? (
        <Button
          size="sm"
          color="red"
          variant="light"
          onClick={() => void deleteActiveRole()}
          loading={savingKey === activeRole.key}
        >
          Delete role
        </Button>
      ) : null}
    </Group>
  );

  if (layout === 'stack') {
    return (
      <Stack gap="sm" style={{ flexShrink: 0 }}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Group gap="xs" align="center" wrap="wrap">
              <Title order={4}>{activeRole.displayName}</Title>
              {statusLabel}
            </Group>
            {description != null ? (
              <Text size="sm" mt={6}>
                {description}
              </Text>
            ) : null}
            {hierarchyInput}
          </Box>
        </Group>
        {actions}
      </Stack>
    );
  }

  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      <Box style={{ minWidth: 0 }}>
        <Group gap="xs" align="center" wrap="nowrap">
          <Title order={4} style={{ whiteSpace: 'nowrap' }}>
            {activeRole.displayName}
          </Title>
          {statusLabel}
        </Group>
        {description != null ? (
          <Text size="sm" mt={6}>
            {description}
          </Text>
        ) : null}
        {hierarchyInput}
      </Box>
      <Group gap="xs" wrap="nowrap">
        {actions}
      </Group>
    </Group>
  );
}
