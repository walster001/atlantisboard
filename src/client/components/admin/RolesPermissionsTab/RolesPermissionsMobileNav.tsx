import { useState, type ReactElement } from 'react';
import {
  ActionIcon,
  Box,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconLock, IconPlus } from '@tabler/icons-react';
import { categoryIcon, categoryLabel, categoryStatusColor } from './categoryMeta.js';
import { MobilePermissionsRow } from './MobilePermissionsRow.js';
import { PermissionMatrix } from './PermissionMatrix.js';
import { RoleEditorForm } from './RoleEditorForm.js';
import { RolesPermissionsAppAdminsPanel } from './RolesPermissionsAppAdminsPanel.js';
import type { AppAdminRow, CategoryStatus, PermissionCategoryKey, RoleRow } from './types.js';

type MobilePermissionsNav = 'roles' | 'app-admins' | 'categories' | 'permissions';

export interface RolesPermissionsMobileNavProps {
  readonly builtIn: readonly RoleRow[];
  readonly custom: readonly RoleRow[];
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
  readonly onOpenCreateRole: () => void;
  readonly onSelectRoleTab: (value: string) => void;
}

export function RolesPermissionsMobileNav({
  builtIn,
  custom,
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
  onOpenCreateRole,
  onSelectRoleTab,
}: RolesPermissionsMobileNavProps): ReactElement {
  const [mobileNav, setMobileNav] = useState<MobilePermissionsNav>('roles');

  const selectRoleTab = (value: string): void => {
    if (value === '__create_custom_role__') {
      onOpenCreateRole();
      return;
    }
    onSelectRoleTab(value);
    if (value === '__app_admins__') {
      setMobileNav('app-admins');
    } else {
      setMobileNav('categories');
    }
  };

  const selectCategory = (categoryKey: PermissionCategoryKey): void => {
    setActiveCategory(categoryKey);
    setMobileNav('permissions');
  };

  const handleMobileBack = (): void => {
    if (mobileNav === 'permissions') {
      setMobileNav('categories');
      return;
    }
    if (mobileNav === 'categories' || mobileNav === 'app-admins') {
      setMobileNav('roles');
    }
  };

  const mobileNavTitle = (() => {
    if (mobileNav === 'app-admins') {
      return 'App Admins';
    }
    if (mobileNav === 'categories') {
      return activeRole?.displayName ?? 'Role';
    }
    if (mobileNav === 'permissions') {
      return categoryLabel(activeCategory);
    }
    return 'Permissions';
  })();

  return (
    <Box className="roles-permissions-tab roles-permissions-tab--mobile-nav">
      {mobileNav !== 'roles' ? (
        <Group className="roles-permissions-tab__mobile-nav-header" gap="sm" wrap="nowrap" align="center">
          <ActionIcon
            type="button"
            variant="subtle"
            color="gray"
            size="lg"
            radius="md"
            onClick={handleMobileBack}
            aria-label="Go back"
          >
            <IconArrowLeft size={22} stroke={1.5} />
          </ActionIcon>
          <Title order={4} style={{ flex: 1, minWidth: 0 }}>
            {mobileNavTitle}
          </Title>
        </Group>
      ) : null}

      <Box className="roles-permissions-tab__mobile-nav-body">
        {mobileNav === 'roles' ? (
          <ScrollArea
            className="roles-permissions-tab__mobile-roles-scroll"
            type="auto"
            offsetScrollbars
            style={{ flex: 1, minHeight: 0 }}
          >
            <Stack gap="xs" pb="md">
              <MobilePermissionsRow
                onClick={() => selectRoleTab('__app_admins__')}
                rightSection={<IconLock size={16} stroke={1.8} aria-hidden />}
              >
                App Admins
              </MobilePermissionsRow>
              <Text size="xs" c="dimmed" fw={600} px={4} mt={4}>
                Built-in Roles
              </Text>
              {builtIn.map((role) => (
                <MobilePermissionsRow
                  key={role.key}
                  onClick={() => selectRoleTab(role.key)}
                  rightSection={
                    <Group gap={6} wrap="nowrap">
                      <Text size="xs" c="dimmed" fw={700}>
                        {role.hierarchyLevel}
                      </Text>
                      <IconLock size={14} stroke={1.8} aria-hidden />
                    </Group>
                  }
                >
                  {role.displayName}
                </MobilePermissionsRow>
              ))}
              {custom.length > 0 ? (
                <>
                  <Divider my={4} />
                  <Text size="xs" c="dimmed" fw={600} px={4}>
                    Custom roles
                  </Text>
                  {custom.map((role) => (
                    <MobilePermissionsRow
                      key={role.key}
                      onClick={() => selectRoleTab(role.key)}
                      rightSection={
                        <Text size="xs" c="dimmed" fw={700}>
                          {role.hierarchyLevel}
                        </Text>
                      }
                    >
                      {role.displayName}
                    </MobilePermissionsRow>
                  ))}
                </>
              ) : null}
              <MobilePermissionsRow
                onClick={() => selectRoleTab('__create_custom_role__')}
                rightSection={<IconPlus size={16} stroke={1.8} aria-hidden />}
              >
                Add custom role
              </MobilePermissionsRow>
            </Stack>
          </ScrollArea>
        ) : null}

        {mobileNav === 'app-admins' ? (
          <Box className="roles-permissions-tab__mobile-app-admins-body">
            <RolesPermissionsAppAdminsPanel
              appAdmins={appAdmins}
              load={load}
              currentUserId={currentUserId}
              bootstrapAppAdminId={bootstrapAppAdminId}
              showHeader={false}
            />
          </Box>
        ) : null}

        {mobileNav === 'categories' ? (
          <Box className="roles-permissions-tab__mobile-categories-panel">
            <Box className="roles-permissions-tab__mobile-categories-header">
              {activeRole != null ? (
                <RoleEditorForm
                  activeRole={activeRole}
                  activeIsDirty={activeIsDirty}
                  draftHierarchyLevels={draftHierarchyLevels}
                  setHierarchyDraft={setHierarchyDraft}
                  parseHierarchy={parseHierarchy}
                  saveActiveRole={saveActiveRole}
                  deleteActiveRole={deleteActiveRole}
                  savingKey={savingKey}
                  layout="stack"
                />
              ) : null}
            </Box>
            <ScrollArea
              className="roles-permissions-tab__mobile-categories-scroll"
              type="auto"
              offsetScrollbars
            >
              <Stack gap={6} pb="md">
                <Text size="xs" c="dimmed" fw={600} px={4}>
                  Permission categories
                </Text>
                {categories.map((categoryKey) => {
                  const status = categoryStatuses.get(categoryKey) ?? 'none';
                  return (
                    <MobilePermissionsRow
                      key={categoryKey}
                      onClick={() => selectCategory(categoryKey)}
                      rightSection={
                        <Group gap={8} wrap="nowrap" align="center">
                          {categoryIcon(categoryKey)}
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
                        </Group>
                      }
                    >
                      {categoryLabel(categoryKey)}
                    </MobilePermissionsRow>
                  );
                })}
              </Stack>
            </ScrollArea>
          </Box>
        ) : null}

        {mobileNav === 'permissions' ? (
          <ScrollArea
            className="roles-permissions-tab__mobile-permissions-scroll"
            type="auto"
            offsetScrollbars
            style={{ flex: 1, minHeight: 0 }}
          >
            <PermissionMatrix {...permissionMatrixProps} layout="stack" />
          </ScrollArea>
        ) : null}
      </Box>
    </Box>
  );
}
