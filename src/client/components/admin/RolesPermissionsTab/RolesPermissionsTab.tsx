import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Loader,
  Title,
} from '@mantine/core';
import { api } from '../../../utils/api.js';
import { useAuthContext } from '../../../contexts/AuthContext.js';
import { CATEGORY_ORDER } from './categoryMeta.js';
import { MEMBERS_ROLE_UPDATE_MODE_KEYS, MEMBERS_ROLE_UPDATE_MODE_OPTIONS, PERMISSION_DESCRIPTIONS } from './permissionsCatalog.js';
import { clampHierarchyLevel, parseHierarchyFromInput, permissionCategoryForKey } from './permissionUtils.js';
import { BUILTIN_ROLE_ORDER } from './roleDefinitions.js';
import { CreateRoleModal } from './CreateRoleModal.js';
import type { AppAdminRow, CategoryStatus, PermissionCategoryKey, RoleRow } from './types.js';
import { RolesPermissionsTabContent } from './RolesPermissionsTabContent.js';
import '../rolesPermissionsTab.css';

export function RolesPermissionsTab() {
  const { user: authUser } = useAuthContext();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [appAdmins, setAppAdmins] = useState<AppAdminRow[]>([]);
  const [bootstrapAppAdminId, setBootstrapAppAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('admin');
  const [activeCategory, setActiveCategory] = useState<PermissionCategoryKey>('workspaces');
  const [draftPermissions, setDraftPermissions] = useState<Record<string, readonly string[]>>({});
  const [draftHierarchyLevels, setDraftHierarchyLevels] = useState<Record<string, number>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const activeIsAppAdmins = activeTab === '__app_admins__';

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [res, admins] = await Promise.all([api.getRoles(), api.getAppAdmins()]);
      const rows = ((res.roles as unknown[]) ?? [])
        .map((raw) => {
          const row = raw as Partial<RoleRow>;
          return {
            key: typeof row.key === 'string' ? row.key : '',
            displayName: typeof row.displayName === 'string' ? row.displayName : 'Unknown',
            ...(typeof row.description === 'string' ? { description: row.description } : {}),
            permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
            hierarchyLevel:
              typeof row.hierarchyLevel === 'number' && Number.isFinite(row.hierarchyLevel)
                ? row.hierarchyLevel
                : 0,
            isBuiltIn: row.isBuiltIn === true,
          } satisfies RoleRow;
        })
        .filter((role) => role.key !== '');
      setRoles(rows);
      setAppAdmins((admins.appAdmins as AppAdminRow[]) ?? []);
      setBootstrapAppAdminId(
        typeof admins.bootstrapAppAdminId === 'string' ? admins.bootstrapAppAdminId : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roles');
      setRoles([]);
      setAppAdmins([]);
      setBootstrapAppAdminId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const builtIn = useMemo(() => {
    const byKey = new Map(roles.filter((role) => role.isBuiltIn).map((role) => [role.key, role]));
    return BUILTIN_ROLE_ORDER.map((key) => byKey.get(key)).filter((role): role is RoleRow => role !== undefined);
  }, [roles]);

  const custom = useMemo(() => roles.filter((role) => !role.isBuiltIn), [roles]);
  const roleByKey = useMemo(() => new Map(roles.map((role) => [role.key, role])), [roles]);
  const activeRole = roleByKey.get(activeTab) ?? null;

  const allPermissionStrings = useMemo(() => {
    const set = new Set<string>();
    for (const key of Object.keys(PERMISSION_DESCRIPTIONS)) {
      if (key.trim() !== '') set.add(key.trim());
    }
    for (const role of roles) {
      for (const permission of role.permissions) {
        if (typeof permission === 'string' && permission.trim() !== '') set.add(permission.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roles]);

  const activeEffectivePermissions = useMemo((): readonly string[] => {
    if (!activeRole || activeIsAppAdmins) return [];
    return draftPermissions[activeRole.key] ?? activeRole.permissions;
  }, [activeRole, draftPermissions, activeIsAppAdmins]);

  const activeEnabledSet = useMemo(() => new Set(activeEffectivePermissions), [activeEffectivePermissions]);

  const permissionKeysByCategory = useMemo(() => {
    const by = new Map<PermissionCategoryKey, string[]>();
    for (const category of CATEGORY_ORDER) by.set(category, []);
    for (const key of allPermissionStrings) {
      if (key.startsWith('app.') || key.startsWith('users.') || key.startsWith('ui.')) continue;
      if (key.endsWith('.list')) continue;
      if (key.endsWith('.view') && key !== 'invites.view') continue;
      if (MEMBERS_ROLE_UPDATE_MODE_KEYS.has(key)) continue;
      const category = permissionCategoryForKey(key);
      const bucket = by.get(category);
      if (bucket) bucket.push(key);
      else by.set(category, [key]);
    }
    for (const [category, keys] of by.entries()) by.set(category, keys.sort((a, b) => a.localeCompare(b)));
    return by;
  }, [allPermissionStrings]);

  const categories = useMemo(() => {
    const present = new Set<PermissionCategoryKey>();
    for (const [category, keys] of permissionKeysByCategory.entries()) {
      if (keys.length > 0) present.add(category);
    }
    const ordered = CATEGORY_ORDER.filter((category) => present.has(category));
    if (!present.has(activeCategory) && ordered.length > 0) {
      setActiveCategory(ordered[0]!);
    }
    return ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionKeysByCategory]);

  const categoryStatuses = useMemo(() => {
    const next = new Map<PermissionCategoryKey, CategoryStatus>();
    for (const category of categories) {
      const keys = permissionKeysByCategory.get(category) ?? [];
      if (keys.length === 0) {
        next.set(category, 'none');
        continue;
      }
      let enabled = 0;
      for (const key of keys) {
        if (activeEnabledSet.has(key)) enabled += 1;
      }
      next.set(category, enabled === 0 ? 'none' : enabled === keys.length ? 'all' : 'some');
    }
    return next;
  }, [permissionKeysByCategory, activeEnabledSet, categories]);

  const setAllPermissionsForActiveCategory = (enabled: boolean): void => {
    if (!activeRole || activeIsAppAdmins || activeRole.isBuiltIn) return;
    const keys = permissionKeysByCategory.get(activeCategory) ?? [];
    if (keys.length === 0) return;

    const base = draftPermissions[activeRole.key] ?? activeRole.permissions;
    const next = new Set(base.map((permission) => permission.trim()).filter((permission) => permission !== ''));
    if (enabled) {
      for (const key of keys) next.add(key);
    } else {
      for (const key of keys) next.delete(key);
    }
    setDraftPermissions((prev) => ({ ...prev, [activeRole.key]: [...next].sort((a, b) => a.localeCompare(b)) }));
  };

  const activeIsDirty =
    activeRole != null &&
    !activeIsAppAdmins &&
    (draftPermissions[activeRole.key] !== undefined ||
      (draftHierarchyLevels[activeRole.key] !== undefined &&
        draftHierarchyLevels[activeRole.key] !== activeRole.hierarchyLevel));

  const togglePermission = (roleKey: string, permission: string): void => {
    const role = roleByKey.get(roleKey);
    if (!role || role.isBuiltIn) return;
    const current = new Set(
      (draftPermissions[roleKey] ?? role.permissions).map((item) => item.trim()).filter((item) => item !== ''),
    );
    if (current.has(permission)) current.delete(permission);
    else current.add(permission);
    setDraftPermissions((prev) => ({ ...prev, [roleKey]: [...current].sort((a, b) => a.localeCompare(b)) }));
  };

  const activeMemberRoleUpdateMode = useMemo((): string | null => {
    if (!activeRole || activeIsAppAdmins) return null;
    const permissions = draftPermissions[activeRole.key] ?? activeRole.permissions;
    for (const option of MEMBERS_ROLE_UPDATE_MODE_OPTIONS) {
      if (permissions.includes(option.value)) return option.value;
    }
    return null;
  }, [activeRole, activeIsAppAdmins, draftPermissions]);

  const setMemberRoleUpdateMode = (roleKey: string, modeKey: string | null): void => {
    const role = roleByKey.get(roleKey);
    if (!role || role.isBuiltIn) return;

    const base = draftPermissions[roleKey] ?? role.permissions;
    const next = new Set(
      base
        .map((permission) => permission.trim())
        .filter((permission) => permission !== '')
        .filter((permission) => !MEMBERS_ROLE_UPDATE_MODE_KEYS.has(permission)),
    );
    if (modeKey != null && modeKey !== '') next.add(modeKey);
    setDraftPermissions((prev) => ({ ...prev, [roleKey]: [...next].sort((a, b) => a.localeCompare(b)) }));
  };

  const setHierarchyDraft = (roleKey: string, next: number): void => {
    setDraftHierarchyLevels((prev) => ({ ...prev, [roleKey]: clampHierarchyLevel(next) }));
  };

  const saveActiveRole = async (): Promise<void> => {
    if (!activeRole || activeIsAppAdmins) return;
    const nextPerms = draftPermissions[activeRole.key];
    const nextHierarchy = draftHierarchyLevels[activeRole.key];
    const hasPermDraft = nextPerms !== undefined;
    const hasHierarchyDraft = nextHierarchy !== undefined && nextHierarchy !== activeRole.hierarchyLevel;
    if (!hasPermDraft && !hasHierarchyDraft) return;

    const finalHierarchy = nextHierarchy ?? activeRole.hierarchyLevel;
    const hierarchyToRole = new Map<number, string>();
    for (const role of roles) {
      const level = role.key === activeRole.key ? finalHierarchy : (draftHierarchyLevels[role.key] ?? role.hierarchyLevel);
      const owner = hierarchyToRole.get(level);
      if (owner && owner !== role.key) {
        setError(`Hierarchy number ${level} is already used by role "${owner}".`);
        return;
      }
      hierarchyToRole.set(level, role.key);
    }

    setSavingKey(activeRole.key);
    setError(null);
    try {
      await api.updateRole(activeRole.key, {
        ...(hasPermDraft && nextPerms ? { permissions: [...nextPerms] } : {}),
        ...(hasHierarchyDraft ? { hierarchyLevel: finalHierarchy } : {}),
      });
      setDraftPermissions((prev) => {
        const { [activeRole.key]: _removed, ...rest } = prev;
        return rest;
      });
      setDraftHierarchyLevels((prev) => {
        const { [activeRole.key]: _removed, ...rest } = prev;
        return rest;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save role');
    } finally {
      setSavingKey(null);
    }
  };

  const deleteActiveRole = async (): Promise<void> => {
    if (!activeRole || activeRole.isBuiltIn) return;
    setSavingKey(activeRole.key);
    setError(null);
    try {
      await api.deleteRole(activeRole.key);
      setDraftPermissions((prev) => {
        const { [activeRole.key]: _removed, ...rest } = prev;
        return rest;
      });
      setActiveTab('admin');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete role');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Box className="roles-permissions-tab">
      <Title order={3} mb="sm">
        Permissions
      </Title>
      {error ? <Alert color="red" mb="sm">{error}</Alert> : null}
      {loading ? (
        <Box style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
          <Loader size="sm" />
        </Box>
      ) : null}
      <RolesPermissionsTabContent
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCreateRole={() => setShowCreate(true)}
        builtIn={builtIn}
        custom={custom}
        activeIsAppAdmins={activeIsAppAdmins}
        appAdmins={appAdmins}
        load={load}
        currentUserId={authUser?.id}
        bootstrapAppAdminId={bootstrapAppAdminId}
        categories={categories}
        categoryStatuses={categoryStatuses}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        activeRole={activeRole}
        activeIsDirty={activeIsDirty}
        draftHierarchyLevels={draftHierarchyLevels}
        setHierarchyDraft={setHierarchyDraft}
        parseHierarchy={parseHierarchyFromInput}
        saveActiveRole={saveActiveRole}
        deleteActiveRole={deleteActiveRole}
        savingKey={savingKey}
        allPermissionStrings={allPermissionStrings}
        permissionKeysByCategory={permissionKeysByCategory}
        activeEnabledSet={activeEnabledSet}
        activeMemberRoleUpdateMode={activeMemberRoleUpdateMode}
        setMemberRoleUpdateMode={setMemberRoleUpdateMode}
        setAllPermissionsForActiveCategory={setAllPermissionsForActiveCategory}
        togglePermission={togglePermission}
      />

      {showCreate ? (
        <CreateRoleModal
          existingRoleKeys={roles.map((role) => role.key)}
          onClose={() => setShowCreate(false)}
          onCreated={async (createdRoleKey) => {
            setShowCreate(false);
            setActiveTab(createdRoleKey);
            await load();
          }}
        />
      ) : null}
    </Box>
  );
}
