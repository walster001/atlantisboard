import { useState, useCallback, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { RolesList } from './roles-list';
import { CategoriesList, calculateCategoryStatus } from './categories-list';
import { RoleDetailView } from './role-detail-view';
import { AppAdminUserList } from './app-admin-user-list';
import { CreateRoleDialog } from './create-role-dialog';
import { DeleteRoleDialog } from './delete-role-dialog';
import { usePermissionsData } from './usePermissionsData';
import { PERMISSION_CATEGORIES, BUILT_IN_ROLE_PERMISSIONS, BOARD_LEVEL_CATEGORIES, CategoryStatus } from './types';
import { PermissionKey } from '@/lib/permissions/types';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/integrations/api/client';

interface AppAdmin {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export function PermissionsSettings() {
  const { isAppAdmin } = useAuth();
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
  const [selectedRoleId, setSelectedRoleId] = useState<string>('app-admin');
  const [selectedRoleIsBuiltIn, setSelectedRoleIsBuiltIn] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState('boards');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // App Admins list
  const [appAdmins, setAppAdmins] = useState<AppAdmin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  
  // Editing state for custom roles
  const [editedPermissions, setEditedPermissions] = useState<Set<PermissionKey>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load App Admins
  const loadAppAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const { data, error } = await api
        .from('profiles')
        .select('id, email, fullName, avatarUrl')
        .eq('isAdmin', true)
        .order('createdAt', { ascending: true });

      if (error) throw error;
      setAppAdmins(data || []);
    } catch (error) {
      console.error('Error loading app admins:', error);
    } finally {
      setLoadingAdmins(false);
    }
  }, []);

  useEffect(() => {
    loadAppAdmins();
  }, [loadAppAdmins]);

  // Get the currently selected custom role
  const selectedCustomRole = useMemo(() => 
    customRoles.find(r => r.id === selectedRoleId),
    [customRoles, selectedRoleId]
  );

  // Check if App Admin tab is selected
  const isAppAdminSelected = selectedRoleId === 'app-admin' && selectedRoleIsBuiltIn;

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
    setSelectedRoleId(roleId);
    setSelectedRoleIsBuiltIn(isBuiltIn);
    setHasUnsavedChanges(false);
    
    // Reset category to first board-level category when switching roles
    if (roleId !== 'app-admin') {
      setSelectedCategoryId('boards');
    }
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
      setSelectedRoleId('app-admin');
      setSelectedRoleIsBuiltIn(true);
      setDeleteDialogOpen(false);
    }
  }, [selectedRoleId, deleteRole]);

  // Determine if Board Admin permissions are editable (only by App Admins)
  const isBoardAdminEditable = selectedRoleId === 'admin' && selectedRoleIsBuiltIn && isAppAdmin;

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
          Manage roles and their permissions. App Admins have full global access. Board Admins have board-level permissions only.
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

        {/* Conditional: App Admin shows user list, others show categories + detail */}
        {isAppAdminSelected ? (
          <AppAdminUserList
            loading={loadingAdmins}
            onRefresh={loadAppAdmins}
          />
        ) : (
          <>
            {/* Categories Panel - show all categories for consistent layout */}
            <CategoriesList
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={handleSelectCategory}
              getCategoryStatus={getCategoryStatus}
              categories={PERMISSION_CATEGORIES}
            />

            {/* Role Detail View */}
            <RoleDetailView
              roleId={selectedRoleId}
              isBuiltIn={selectedRoleIsBuiltIn}
              isEditable={!selectedRoleIsBuiltIn || isBoardAdminEditable}
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
          </>
        )}
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