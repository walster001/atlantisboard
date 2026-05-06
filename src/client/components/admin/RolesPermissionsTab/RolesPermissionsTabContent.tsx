import { Alert, Box, Button, Card, Divider, Grid, Group, ScrollArea, Select, Stack, Switch, Tabs, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { IconLock, IconPlus } from '@tabler/icons-react';
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
