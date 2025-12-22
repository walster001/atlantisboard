/**
 * Permissions Settings Component
 * Main component for managing roles and permissions
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { RolesList } from './RolesList';
import { CategoriesList, calculateCategoryStatus } from './CategoriesList';
import { RoleDetailView } from './RoleDetailView';
import { CreateRoleDialog } from './CreateRoleDialog';
import { DeleteRoleDialog } from './DeleteRoleDialog';
import { usePermissionsData } from './usePermissionsData';
import { PERMISSION_CATEGORIES, BUILT_IN_ROLE_PERMISSIONS, CategoryStatus } from './types';
import { PermissionKey } from '@/lib/permissions/types';

export function PermissionsSettings() {
  const {
    customRoles,
    loading,
    saving,
    getRolePermissions,
    createRole,
    deleteRole,
    saveRolePermissions,
  } = usePermissionsData();

  // UI State
  const [selectedRoleId, setSelectedRoleId] = useState<string>('admin');
  const [selectedRoleIsBuiltIn, setSelectedRoleIsBuiltIn] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState('app-admin');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Editing state for custom roles
  const [editedPermissions, setEditedPermissions] = useState<Set<PermissionKey>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Get the currently selected custom role
  const selectedCustomRole = useMemo(() => 
    customRoles.find(r => r.id === selectedRoleId),
    [customRoles, selectedRoleId]
  );

  // Load permissions when selecting a custom role
  useEffect(() => {
    if (!selectedRoleIsBuiltIn && selectedRoleId) {
      const perms = getRolePermissions(selectedRoleId);
      setEditedPermissions(new Set(perms));
      setHasUnsavedChanges(false);
    }
  }, [selectedRoleId, selectedRoleIsBuiltIn, getRolePermissions]);

  // Handle role selection
  const handleSelectRole = useCallback((roleId: string, isBuiltIn: boolean) => {
    // TODO: Warn about unsaved changes
    setSelectedRoleId(roleId);
    setSelectedRoleIsBuiltIn(isBuiltIn);
    setHasUnsavedChanges(false);
  }, []);

  // Handle category selection
  const handleSelectCategory = useCallback((categoryId: string) => {
    setSelectedCategoryId(categoryId);
  }, []);

  // Toggle a single permission
  const handleTogglePermission = useCallback((permKey: PermissionKey) => {
    setEditedPermissions(prev => {
      const next = new Set(prev);
      if (next.has(permKey)) {
        next.delete(permKey);
      } else {
        next.add(permKey);
      }
      return next;
    });
    setHasUnsavedChanges(true);
  }, []);

  // Toggle all permissions in current category
  const handleToggleCategory = useCallback(() => {
    const category = PERMISSION_CATEGORIES.find(c => c.id === selectedCategoryId);
    if (!category) return;

    const categoryPerms = category.permissions.map(p => p.key);
    const allEnabled = categoryPerms.every(key => editedPermissions.has(key));

    setEditedPermissions(prev => {
      const next = new Set(prev);
      categoryPerms.forEach(key => {
        if (allEnabled) {
          next.delete(key);
        } else {
          next.add(key);
        }
      });
      return next;
    });
    setHasUnsavedChanges(true);
  }, [selectedCategoryId, editedPermissions]);

  // Get category status for display
  const getCategoryStatus = useCallback((categoryId: string): CategoryStatus => {
    if (selectedRoleIsBuiltIn) {
      const builtInPerms = BUILT_IN_ROLE_PERMISSIONS[selectedRoleId] || new Set();
      return calculateCategoryStatus(categoryId, builtInPerms);
    }
    return calculateCategoryStatus(categoryId, editedPermissions);
  }, [selectedRoleId, selectedRoleIsBuiltIn, editedPermissions]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (selectedRoleIsBuiltIn) return;
    const success = await saveRolePermissions(selectedRoleId, editedPermissions);
    if (success) {
      setHasUnsavedChanges(false);
    }
  }, [selectedRoleId, selectedRoleIsBuiltIn, editedPermissions, saveRolePermissions]);

  // Handle create role
  const handleCreateRole = useCallback(async (name: string, description: string) => {
    const newRole = await createRole(name, description);
    if (newRole) {
      setSelectedRoleId(newRole.id);
      setSelectedRoleIsBuiltIn(false);
      setEditedPermissions(new Set());
      setHasUnsavedChanges(false);
    }
  }, [createRole]);

  // Handle delete role
  const handleDeleteRole = useCallback(async () => {
    const success = await deleteRole(selectedRoleId);
    if (success) {
      // Select first built-in role after deletion
      setSelectedRoleId('admin');
      setSelectedRoleIsBuiltIn(true);
      setDeleteDialogOpen(false);
    }
  }, [selectedRoleId, deleteRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Permissions</h2>
        <p className="text-muted-foreground">
          Manage board roles and their permissions. App-level permissions (Administration, Themes, Workspaces) 
          require App Admin status, which is automatically granted to the first user who signs in.
        </p>
      </div>

      <div className="flex gap-4 min-h-[600px]">
        {/* Roles Panel */}
        <RolesList
          customRoles={customRoles}
          selectedRoleId={selectedRoleId}
          selectedRoleIsBuiltIn={selectedRoleIsBuiltIn}
          onSelectRole={handleSelectRole}
          onAddRole={() => setCreateDialogOpen(true)}
        />

        {/* Categories Panel */}
        <CategoriesList
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
          getCategoryStatus={getCategoryStatus}
        />

        {/* Role Detail View */}
        <RoleDetailView
          roleId={selectedRoleId}
          isBuiltIn={selectedRoleIsBuiltIn}
          selectedCategoryId={selectedCategoryId}
          permissions={editedPermissions}
          hasUnsavedChanges={hasUnsavedChanges}
          saving={saving}
          customRole={selectedCustomRole}
          onTogglePermission={handleTogglePermission}
          onToggleCategory={handleToggleCategory}
          onSave={handleSave}
          onDelete={() => setDeleteDialogOpen(true)}
        />
      </div>

      {/* Dialogs */}
      <CreateRoleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={handleCreateRole}
        saving={saving}
      />

      <DeleteRoleDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        roleName={selectedCustomRole?.name || ''}
        onConfirm={handleDeleteRole}
        saving={saving}
      />
    </div>
  );
}
