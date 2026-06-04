import type { ReactElement } from 'react';
import {
  Box,
  Button,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
import { IconLock, IconPlus } from '@tabler/icons-react';
import { categoryIcon, categoryLabel, categoryStatusColor } from './categoryMeta.js';
import { PermissionMatrix } from './PermissionMatrix.js';
import { RoleEditorForm } from './RoleEditorForm.js';
import { RolesPermissionsAppAdminsPanel } from './RolesPermissionsAppAdminsPanel.js';
import type { AppAdminRow, CategoryStatus, PermissionCategoryKey, RoleRow } from './types.js';

export interface RolesPermissionsDesktopLayoutProps {
  readonly activeTab: string;
  readonly setActiveTab: (value: string) => void;
  readonly onOpenCreateRole: () => void;
  readonly builtIn: readonly RoleRow[];
  readonly custom: readonly RoleRow[];
  readonly activeIsAppAdmins: boolean;
  readonly appAdmins: readonly AppAdminRow[];
  readonly load: () => Promise<void>;
  readonly currentUserId: string | undefined;
  readonly bootstrapAppAdminId: string | null;
  readonly categories: readonly PermissionCategoryKey[];
  readonly categoryStatuses: ReadonlyMap<PermissionCategoryKey, CategoryStatus>;
  readonly activeCategory: PermissionCategoryKey;
  readonly setActiveCategory: (value: PermissionCategoryKey) => void;
  readonly activeRole: RoleRow | null;
  readonly activeIsDirty: boolean;
  readonly draftHierarchyLevels: Readonly<Record<string, number>>;
  readonly setHierarchyDraft: (roleKey: string, value: number) => void;
  readonly parseHierarchy: (value: string, fallback: number) => number;
  readonly saveActiveRole: () => Promise<void>;
  readonly deleteActiveRole: () => Promise<void>;
  readonly savingKey: string | null;
  readonly permissionMatrixProps: {
    readonly activeRole: RoleRow | null;
    readonly activeCategory: PermissionCategoryKey;
    readonly categoryStatuses: ReadonlyMap<PermissionCategoryKey, CategoryStatus>;
    readonly allPermissionStrings: readonly string[];
    readonly permissionKeysByCategory: ReadonlyMap<PermissionCategoryKey, readonly string[]>;
    readonly activeEnabledSet: ReadonlySet<string>;
    readonly activeMemberRoleUpdateMode: string | null;
    readonly setMemberRoleUpdateMode: (roleKey: string, modeKey: string | null) => void;
    readonly setAllPermissionsForActiveCategory: (enabled: boolean) => void;
    readonly togglePermission: (roleKey: string, permission: string) => void;
  };
}

export function RolesPermissionsDesktopLayout({
  activeTab,
  setActiveTab,
  onOpenCreateRole,
  builtIn,
  custom,
  activeIsAppAdmins,
  appAdmins,
  load,
  currentUserId,
  bootstrapAppAdminId,
  categories,
  categoryStatuses,
  activeCategory,
  setActiveCategory,
  activeRole,
  activeIsDirty,
  draftHierarchyLevels,
  setHierarchyDraft,
  parseHierarchy,
  saveActiveRole,
  deleteActiveRole,
  savingKey,
  permissionMatrixProps,
}: RolesPermissionsDesktopLayoutProps): ReactElement {
  return (
    <Tabs
      value={activeTab}
      onChange={(value) => {
        if (value === '__create_custom_role__') {
          onOpenCreateRole();
          return;
        }
        if (typeof value === 'string' && value !== '') {
          setActiveTab(value);
        }
      }}
      orientation="vertical"
      keepMounted={false}
      classNames={{ root: 'roles-permissions-tab__tabs-root' }}
    >
      <Group align="stretch" wrap="nowrap" gap="md" className="roles-permissions-tab__tabs-row">
        <Tabs.List style={{ minWidth: 220 }}>
          <Tabs.Tab value="__app_admins__">
            <Group gap="xs" wrap="nowrap" justify="space-between" align="center">
              <Text fw={600} size="sm">App Admins</Text>
              <IconLock size={16} stroke={1.8} aria-hidden />
            </Group>
          </Tabs.Tab>
          <Text size="xs" c="dimmed" fw={600} px="xs" mt="sm" mb={6}>Built-in Roles</Text>
          {builtIn.map((role) => (
            <Tabs.Tab key={role.key} value={role.key}>
              <Group gap="xs" wrap="nowrap" justify="space-between" align="center">
                <Text fw={600} size="sm">{role.displayName}</Text>
                <Group gap={4} wrap="nowrap">
                  <Text size="xs" c="dimmed" fw={700}>{role.hierarchyLevel}</Text>
                  <IconLock size={14} stroke={1.8} aria-hidden />
                </Group>
              </Group>
            </Tabs.Tab>
          ))}
          <Divider my="xs" />
          {custom.length > 0 ? (
            <>
              <Text size="xs" c="dimmed" fw={600} px="xs" mt="sm" mb={6}>Custom roles</Text>
              {custom.map((role) => (
                <Tabs.Tab key={role.key} value={role.key}>
                  <Group gap="xs" wrap="nowrap" justify="space-between" align="center">
                    <Text fw={600} size="sm" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
                      {role.displayName}
                    </Text>
                    <Text size="xs" c="dimmed" fw={700}>{role.hierarchyLevel}</Text>
                  </Group>
                </Tabs.Tab>
              ))}
            </>
          ) : null}
          <Tabs.Tab value="__create_custom_role__">
            <Group gap="xs" wrap="nowrap" justify="flex-start" align="center">
              <IconPlus size={16} stroke={1.8} aria-hidden />
              <Text fw={600} size="sm">Add custom role</Text>
            </Group>
          </Tabs.Tab>
        </Tabs.List>
        {activeIsAppAdmins ? (
          <RolesPermissionsAppAdminsPanel
            appAdmins={appAdmins}
            load={load}
            currentUserId={currentUserId}
            bootstrapAppAdminId={bootstrapAppAdminId}
            showHeader
          />
        ) : (
          <>
            <Box style={{ minWidth: 220 }}>
              <Stack gap={6}>
                <Text size="xs" c="dimmed" fw={600} px="xs" mt={2} mb={6}>Permission categories</Text>
                {categories.map((categoryKey) => {
                  const status = categoryStatuses.get(categoryKey) ?? 'none';
                  const isActive = activeCategory === categoryKey;
                  return (
                    <Button
                      key={categoryKey}
                      variant={isActive ? 'light' : 'subtle'}
                      color={isActive ? 'blue' : 'gray'}
                      justify="space-between"
                      leftSection={categoryIcon(categoryKey)}
                      rightSection={
                        <Box
                          aria-hidden
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: categoryStatusColor(status),
                            flex: '0 0 auto',
                          }}
                        />
                      }
                      styles={{
                        inner: { width: '100%' },
                        label: { width: '100%', justifyContent: 'flex-start', minWidth: 0 },
                        section: { marginInline: 0 },
                      }}
                      onClick={() => setActiveCategory(categoryKey)}
                    >
                      <Text
                        size="sm"
                        fw={600}
                        lineClamp={1}
                        style={{ textAlign: 'left' }}
                        {...(!isActive ? { c: 'dimmed' } : {})}
                      >
                        {categoryLabel(categoryKey)}
                      </Text>
                    </Button>
                  );
                })}
              </Stack>
            </Box>
            <Box style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {activeRole != null ? (
                <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                  <RoleEditorForm
                    activeRole={activeRole}
                    activeIsDirty={activeIsDirty}
                    draftHierarchyLevels={draftHierarchyLevels}
                    setHierarchyDraft={setHierarchyDraft}
                    parseHierarchy={parseHierarchy}
                    saveActiveRole={saveActiveRole}
                    deleteActiveRole={deleteActiveRole}
                    savingKey={savingKey}
                    layout="toolbar"
                  />
                  <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                    <PermissionMatrix {...permissionMatrixProps} layout="grid" />
                  </ScrollArea>
                </Stack>
              ) : (
                <Text c="dimmed">Select a role.</Text>
              )}
            </Box>
          </>
        )}
      </Group>
    </Tabs>
  );
}
