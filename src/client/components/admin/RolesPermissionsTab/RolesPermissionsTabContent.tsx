import type { ReactElement } from 'react';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { RolesPermissionsDesktopLayout } from './RolesPermissionsDesktopLayout.js';
import { RolesPermissionsMobileNav } from './RolesPermissionsMobileNav.js';
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

export function RolesPermissionsTabContent(props: RolesPermissionsTabContentProps): ReactElement {
  const isMobile = useResponsiveTier() === 'mobile';

  const permissionMatrixProps = {
    activeRole: props.activeRole,
    activeCategory: props.activeCategory,
    categoryStatuses: props.categoryStatuses,
    allPermissionStrings: props.allPermissionStrings,
    permissionKeysByCategory: props.permissionKeysByCategory,
    activeEnabledSet: props.activeEnabledSet,
    activeMemberRoleUpdateMode: props.activeMemberRoleUpdateMode,
    setMemberRoleUpdateMode: props.setMemberRoleUpdateMode,
    setAllPermissionsForActiveCategory: props.setAllPermissionsForActiveCategory,
    togglePermission: props.togglePermission,
  } as const;

  if (isMobile) {
    return (
      <RolesPermissionsMobileNav
        builtIn={props.builtIn}
        custom={props.custom}
        appAdmins={props.appAdmins}
        load={props.load}
        currentUserId={props.currentUserId}
        bootstrapAppAdminId={props.bootstrapAppAdminId}
        categories={props.categories}
        categoryStatuses={props.categoryStatuses}
        activeCategory={props.activeCategory}
        setActiveCategory={props.setActiveCategory}
        activeRole={props.activeRole}
        activeIsDirty={props.activeIsDirty}
        draftHierarchyLevels={props.draftHierarchyLevels}
        setHierarchyDraft={props.setHierarchyDraft}
        parseHierarchy={props.parseHierarchy}
        saveActiveRole={props.saveActiveRole}
        deleteActiveRole={props.deleteActiveRole}
        savingKey={props.savingKey}
        permissionMatrixProps={permissionMatrixProps}
        onOpenCreateRole={props.onOpenCreateRole}
        onSelectRoleTab={props.setActiveTab}
      />
    );
  }

  return (
    <RolesPermissionsDesktopLayout
      activeTab={props.activeTab}
      setActiveTab={props.setActiveTab}
      onOpenCreateRole={props.onOpenCreateRole}
      builtIn={props.builtIn}
      custom={props.custom}
      activeIsAppAdmins={props.activeIsAppAdmins}
      appAdmins={props.appAdmins}
      load={props.load}
      currentUserId={props.currentUserId}
      bootstrapAppAdminId={props.bootstrapAppAdminId}
      categories={props.categories}
      categoryStatuses={props.categoryStatuses}
      activeCategory={props.activeCategory}
      setActiveCategory={props.setActiveCategory}
      activeRole={props.activeRole}
      activeIsDirty={props.activeIsDirty}
      draftHierarchyLevels={props.draftHierarchyLevels}
      setHierarchyDraft={props.setHierarchyDraft}
      parseHierarchy={props.parseHierarchy}
      saveActiveRole={props.saveActiveRole}
      deleteActiveRole={props.deleteActiveRole}
      savingKey={props.savingKey}
      permissionMatrixProps={permissionMatrixProps}
    />
  );
}
