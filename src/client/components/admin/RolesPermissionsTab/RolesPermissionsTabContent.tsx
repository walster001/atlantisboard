import { useState, type ReactElement, type ReactNode } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconLock, IconPlus } from '@tabler/icons-react';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { AppAdminMemberManagement } from '../AppAdminMemberManagement.js';
import { categoryIcon, categoryLabel, categoryStatusColor } from './categoryMeta.js';
import { MEMBERS_ROLE_UPDATE_MODE_OPTIONS, PERMISSION_DESCRIPTIONS } from './permissionsCatalog.js';
import { BUILTIN_ROLE_DESCRIPTIONS, BUILTIN_ROLE_ORDER } from './roleDefinitions.js';
import { TriStateCategoryToggle } from './TriStateCategoryToggle.js';
import type { AppAdminRow, CategoryStatus, PermissionCategoryKey, RoleRow } from './types.js';

interface RolesPermissionsTabContentProps {
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
  readonly allPermissionStrings: readonly string[];
  readonly permissionKeysByCategory: ReadonlyMap<PermissionCategoryKey, readonly string[]>;
  readonly activeEnabledSet: ReadonlySet<string>;
  readonly activeMemberRoleUpdateMode: string | null;
  readonly setMemberRoleUpdateMode: (roleKey: string, modeKey: string | null) => void;
  readonly setAllPermissionsForActiveCategory: (enabled: boolean) => void;
  readonly togglePermission: (roleKey: string, permission: string) => void;
}

type MobilePermissionsNav = 'roles' | 'app-admins' | 'categories' | 'permissions';

function MobilePermissionsRow(props: {
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly rightSection?: ReactNode;
}): ReactElement {
  const { onClick, children, rightSection } = props;
  return (
    <button type="button" className="roles-permissions-tab__mobile-row" onClick={onClick}>
      <span className="roles-permissions-tab__mobile-row-label">{children}</span>
      {rightSection != null ? (
        <span className="roles-permissions-tab__mobile-row-trailing">{rightSection}</span>
      ) : null}
    </button>
  );
}

export function RolesPermissionsTabContent({
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
  allPermissionStrings,
  permissionKeysByCategory,
  activeEnabledSet,
  activeMemberRoleUpdateMode,
  setMemberRoleUpdateMode,
  setAllPermissionsForActiveCategory,
  togglePermission,
}: RolesPermissionsTabContentProps) {
  const isMobile = useResponsiveTier() === 'mobile';
  const [mobileNav, setMobileNav] = useState<MobilePermissionsNav>('roles');

  const selectRoleTab = (value: string): void => {
    if (value === '__create_custom_role__') {
      onOpenCreateRole();
      return;
    }
    setActiveTab(value);
    if (!isMobile) {
      return;
    }
    if (value === '__app_admins__') {
      setMobileNav('app-admins');
    } else {
      setMobileNav('categories');
    }
  };

  const selectCategory = (categoryKey: PermissionCategoryKey): void => {
    setActiveCategory(categoryKey);
    if (isMobile) {
      setMobileNav('permissions');
    }
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

  const renderAppAdminsPanel = (): ReactElement => (
    <Box className="roles-permissions-tab__app-admins-panel">
      <Stack gap="xs" style={{ flexShrink: 0 }} mb="sm">
        <Title order={4}>App Admins</Title>
        <Text size="sm" c="dimmed">
          Grant or revoke global App Admin access. App admins can access this admin configuration/modify
          all aspects of the app.
        </Text>
      </Stack>
      <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AppAdminMemberManagement
          appAdmins={appAdmins}
          onAppAdminsChange={load}
          currentUserId={currentUserId}
          bootstrapAppAdminId={bootstrapAppAdminId}
        />
      </Box>
    </Box>
  );

  const renderActiveRoleHeader = (): ReactElement | null => {
    if (!activeRole) {
      return null;
    }
    return (
      <Stack gap="sm" style={{ flexShrink: 0 }}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Group gap="xs" align="center" wrap="wrap">
              <Title order={4}>{activeRole.displayName}</Title>
              {activeRole.isBuiltIn ? (
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
              )}
            </Group>
            {(activeRole.description ??
              (activeRole.isBuiltIn && activeRole.key in BUILTIN_ROLE_DESCRIPTIONS
                ? BUILTIN_ROLE_DESCRIPTIONS[activeRole.key as (typeof BUILTIN_ROLE_ORDER)[number]]
                : undefined)) ? (
              <Text size="sm" mt={6}>
                {activeRole.description ??
                  (activeRole.isBuiltIn && activeRole.key in BUILTIN_ROLE_DESCRIPTIONS
                    ? BUILTIN_ROLE_DESCRIPTIONS[activeRole.key as (typeof BUILTIN_ROLE_ORDER)[number]]
                    : '')}
              </Text>
            ) : null}
            <Tooltip
              label="Higher hierarchy number means higher role level. Users cannot assign or promote to roles above their allowed hierarchy/mode."
              multiline
              maw={420}
              openDelay={150}
              position="bottom-start"
            >
              <Box mt={10}>
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
          </Box>
        </Group>
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
      </Stack>
    );
  };

  const renderPermissionToggles = (): ReactElement => {
    if (!activeRole) {
      return <Text c="dimmed">Select a role.</Text>;
    }
    if (allPermissionStrings.length === 0) {
      return (
        <Alert color="yellow" title="Permissions">
          No permissions found.
        </Alert>
      );
    }
    return (
      <Stack gap="xs">
        <Card withBorder radius="md" p="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Box style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lineClamp={1}>
                {categoryLabel(activeCategory)}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={2}>
                Toggle all permissions in this category.
              </Text>
            </Box>
            <TriStateCategoryToggle
              status={categoryStatuses.get(activeCategory) ?? 'none'}
              disabled={activeRole.isBuiltIn}
              onToggleAllOn={() => setAllPermissionsForActiveCategory(true)}
              onToggleAllOff={() => setAllPermissionsForActiveCategory(false)}
            />
          </Group>
        </Card>
        {activeCategory === 'members' ? (
          <Card withBorder radius="md" p="sm">
            <Stack gap="sm">
              <Box style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" lineClamp={1}>
                  Board member role update mode
                </Text>
                <Text size="xs" c="dimmed" lineClamp={2}>
                  Choose exactly one hierarchy rule for board member role updates.
                </Text>
              </Box>
              <Select
                size="sm"
                data={[...MEMBERS_ROLE_UPDATE_MODE_OPTIONS]}
                value={activeMemberRoleUpdateMode}
                onChange={(value) => setMemberRoleUpdateMode(activeRole.key, value)}
                disabled={activeRole.isBuiltIn || !activeEnabledSet.has('boards.members.role.update')}
                allowDeselect={false}
              />
              <Switch
                size="md"
                label="Enable role update mode"
                checked={activeMemberRoleUpdateMode != null}
                disabled={activeRole.isBuiltIn}
                onChange={(event) => {
                  if (event.currentTarget.checked) {
                    const fallback =
                      activeMemberRoleUpdateMode ?? MEMBERS_ROLE_UPDATE_MODE_OPTIONS[0]?.value ?? null;
                    setMemberRoleUpdateMode(activeRole.key, fallback);
                  } else {
                    setMemberRoleUpdateMode(activeRole.key, null);
                  }
                }}
                aria-label="Toggle board member role update mode"
                withThumbIndicator={false}
              />
            </Stack>
          </Card>
        ) : null}
        {(permissionKeysByCategory.get(activeCategory) ?? []).map((permission) => (
          <Card key={permission} withBorder radius="md" p="sm">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" lineClamp={1}>
                  {permission}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={3}>
                  {PERMISSION_DESCRIPTIONS[permission] ?? 'No description available.'}
                </Text>
              </Box>
              <Switch
                size="md"
                checked={activeEnabledSet.has(permission)}
                disabled={activeRole.isBuiltIn}
                onChange={() => togglePermission(activeRole.key, permission)}
                aria-label={`Toggle ${permission}`}
                withThumbIndicator={false}
              />
            </Group>
          </Card>
        ))}
      </Stack>
    );
  };

  if (isMobile) {
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
            <Box className="roles-permissions-tab__mobile-app-admins-body">{renderAppAdminsPanel()}</Box>
          ) : null}

          {mobileNav === 'categories' ? (
            <Box className="roles-permissions-tab__mobile-categories-panel">
              <Box className="roles-permissions-tab__mobile-categories-header">{renderActiveRoleHeader()}</Box>
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
              {renderPermissionToggles()}
            </ScrollArea>
          ) : null}
        </Box>
      </Box>
    );
  }

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
          <Box className="roles-permissions-tab__app-admins-panel">
            <Stack gap="xs" style={{ flexShrink: 0 }} mb="sm">
              <Title order={4}>App Admins</Title>
              <Text size="sm" c="dimmed">
                Grant or revoke global App Admin access. App admins can access this admin configuration/modify all aspects of the app.
              </Text>
            </Stack>
            <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <AppAdminMemberManagement
                appAdmins={appAdmins}
                onAppAdminsChange={load}
                currentUserId={currentUserId}
                bootstrapAppAdminId={bootstrapAppAdminId}
              />
            </Box>
          </Box>
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
              {activeRole ? (
                <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Box style={{ minWidth: 0 }}>
                      <Group gap="xs" align="center" wrap="nowrap">
                        <Title order={4} style={{ whiteSpace: 'nowrap' }}>{activeRole.displayName}</Title>
                        {activeRole.isBuiltIn ? (
                          <Text size="sm" c="dimmed" fw={600}>Read-only</Text>
                        ) : activeIsDirty ? (
                          <Text size="sm" c="orange" fw={600}>Unsaved changes</Text>
                        ) : (
                          <Text size="sm" c="green" fw={600}>Editable</Text>
                        )}
                      </Group>
                      {(activeRole.description ??
                        (activeRole.isBuiltIn && activeRole.key in BUILTIN_ROLE_DESCRIPTIONS
                          ? BUILTIN_ROLE_DESCRIPTIONS[activeRole.key as (typeof BUILTIN_ROLE_ORDER)[number]]
                          : undefined)) ? (
                        <Text size="sm" mt={6}>
                          {activeRole.description ??
                            (activeRole.isBuiltIn && activeRole.key in BUILTIN_ROLE_DESCRIPTIONS
                              ? BUILTIN_ROLE_DESCRIPTIONS[activeRole.key as (typeof BUILTIN_ROLE_ORDER)[number]]
                              : '')}
                        </Text>
                      ) : null}
                      <Tooltip
                        label="Higher hierarchy number means higher role level. Users cannot assign or promote to roles above their allowed hierarchy/mode."
                        multiline
                        maw={420}
                        openDelay={150}
                        position="bottom-start"
                      >
                        <Box mt={10} maw={220}>
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
                    </Box>
                    <Group gap="xs" wrap="nowrap">
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
                  </Group>
                  <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                    {allPermissionStrings.length === 0 ? (
                      <Alert color="yellow" title="Permissions">
                        No permissions found.
                      </Alert>
                    ) : (
                      <Grid gutter="xs" pr="sm">
                        <Grid.Col span={12}>
                          <Card withBorder radius="md" p="sm">
                            <Group justify="space-between" align="center" wrap="nowrap">
                              <Box style={{ minWidth: 0 }}>
                                <Text fw={700} size="sm" lineClamp={1}>{categoryLabel(activeCategory)}</Text>
                                <Text size="xs" c="dimmed" lineClamp={2}>
                                  Toggle all permissions in this category.
                                </Text>
                              </Box>
                              <TriStateCategoryToggle
                                status={categoryStatuses.get(activeCategory) ?? 'none'}
                                disabled={!activeRole || activeRole.isBuiltIn}
                                onToggleAllOn={() => setAllPermissionsForActiveCategory(true)}
                                onToggleAllOff={() => setAllPermissionsForActiveCategory(false)}
                              />
                            </Group>
                          </Card>
                        </Grid.Col>
                        {activeCategory === 'members' ? (
                          <Grid.Col span={12}>
                            <Card withBorder radius="md" p="sm">
                              <Group justify="space-between" align="center" wrap="nowrap">
                                <Box style={{ minWidth: 0 }}>
                                  <Text fw={600} size="sm" lineClamp={1}>Board member role update mode</Text>
                                  <Text size="xs" c="dimmed" lineClamp={2}>
                                    Choose exactly one hierarchy rule for board member role updates.
                                  </Text>
                                </Box>
                                <Group gap="sm" wrap="nowrap" align="center">
                                  <Select
                                    size="xs"
                                    w={280}
                                    data={[...MEMBERS_ROLE_UPDATE_MODE_OPTIONS]}
                                    value={activeMemberRoleUpdateMode}
                                    onChange={(value) => setMemberRoleUpdateMode(activeRole.key, value)}
                                    disabled={activeRole.isBuiltIn || !activeEnabledSet.has('boards.members.role.update')}
                                    allowDeselect={false}
                                  />
                                  <Switch
                                    size="md"
                                    checked={activeMemberRoleUpdateMode != null}
                                    disabled={activeRole.isBuiltIn}
                                    onChange={(event) => {
                                      if (event.currentTarget.checked) {
                                        const fallback = activeMemberRoleUpdateMode ?? MEMBERS_ROLE_UPDATE_MODE_OPTIONS[0]?.value ?? null;
                                        setMemberRoleUpdateMode(activeRole.key, fallback);
                                      } else {
                                        setMemberRoleUpdateMode(activeRole.key, null);
                                      }
                                    }}
                                    aria-label="Toggle board member role update mode"
                                    withThumbIndicator={false}
                                  />
                                </Group>
                              </Group>
                            </Card>
                          </Grid.Col>
                        ) : null}
                        {(permissionKeysByCategory.get(activeCategory) ?? []).map((permission) => (
                          <Grid.Col key={permission} span={{ base: 12, md: 6 }}>
                            <Card withBorder radius="md" p="sm">
                              <Group justify="space-between" align="center" wrap="nowrap">
                                <Box style={{ minWidth: 0 }}>
                                  <Text fw={600} size="sm" lineClamp={1}>{permission}</Text>
                                  <Text size="xs" c="dimmed" lineClamp={2}>
                                    {PERMISSION_DESCRIPTIONS[permission] ?? 'No description available.'}
                                  </Text>
                                </Box>
                                <Switch
                                  size="md"
                                  checked={activeEnabledSet.has(permission)}
                                  disabled={activeRole.isBuiltIn}
                                  onChange={() => togglePermission(activeRole.key, permission)}
                                  aria-label={`Toggle ${permission}`}
                                  withThumbIndicator={false}
                                />
                              </Group>
                            </Card>
                          </Grid.Col>
                        ))}
                      </Grid>
                    )}
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
