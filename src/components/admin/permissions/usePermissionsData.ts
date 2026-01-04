/**
 * Hook for managing permissions data
 * 
 * Includes real-time subscriptions to stay in sync with other admins
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';
import { CustomRole, RolePermission } from './types';
import { PermissionKey } from '@/lib/permissions/types';
import { subscribeCustomRoles, subscribeRolePermissions } from '@/realtime/permissionsSubscriptions';

export function usePermissionsData() {
  const { toast } = useToast();
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Track last refetch to debounce rapid changes
  const lastRefetchRef = useRef<number>(0);
  const DEBOUNCE_MS = 500;

  // Fetch custom roles and their permissions
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [rolesResult, permissionsResult] = await Promise.all([
        api.from('custom_roles').select('*').order('name'),
        api.from('role_permissions').select('*'),
      ]);

      if (rolesResult.error) throw rolesResult.error;
      if (permissionsResult.error) throw permissionsResult.error;

      setCustomRoles((rolesResult.data as CustomRole[]) || []);
      setRolePermissions((permissionsResult.data as RolePermission[]) || []);
    } catch (error: any) {
      toast({
        title: 'Error loading permissions',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for roles and permissions changes
  useEffect(() => {
    const debouncedRefetch = () => {
      const now = Date.now();
      if (now - lastRefetchRef.current < DEBOUNCE_MS) return;
      lastRefetchRef.current = now;
      fetchData();
    };

    const cleanupRoles = subscribeCustomRoles({
      onChange: debouncedRefetch,
    });
    const cleanupPerms = subscribeRolePermissions({
      onChange: debouncedRefetch,
    });

    return () => {
      cleanupRoles();
      cleanupPerms();
    };
  }, [fetchData]);

  // Get permissions for a specific role
  const getRolePermissions = useCallback((roleId: string): Set<PermissionKey> => {
    const perms = rolePermissions
      .filter(rp => rp.roleId === roleId)
      .map(rp => rp.permissionKey);
    return new Set(perms);
  }, [rolePermissions]);

  // Create a new custom role
  const createRole = useCallback(async (name: string, description: string): Promise<CustomRole | null> => {
    try {
      setSaving(true);
      
      const insertResult = await api
        .from('custom_roles')
        .insert({ name, description, isSystem: false });
      
      if (insertResult.error) throw insertResult.error;
      
      // The insert returns the created record
      const data = insertResult.data as CustomRole;
      if (!data) throw new Error('Failed to create role');

      setCustomRoles(prev => [...prev, data]);
      toast({
        title: 'Role created',
        description: `"${name}" has been created successfully.`,
      });
      
      return data;
    } catch (error: any) {
      toast({
        title: 'Error creating role',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  // Update role name/description
  const updateRole = useCallback(async (roleId: string, updates: { name?: string; description?: string }): Promise<boolean> => {
    try {
      setSaving(true);
      
      const query = api
        .from('custom_roles')
        .eq('id', roleId);
      const { error } = await query.update(updates);

      if (error) throw error;

      setCustomRoles(prev => 
        prev.map(r => r.id === roleId ? { ...r, ...updates } : r)
      );
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Error updating role',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  // Delete a custom role
  const deleteRole = useCallback(async (roleId: string): Promise<boolean> => {
    try {
      setSaving(true);
      
      // First delete all permissions for this role
      const permQuery = api
        .from('role_permissions')
        .eq('roleId', roleId);
      await permQuery.delete();

      // Then delete the role
      const roleQuery = api
        .from('custom_roles')
        .eq('id', roleId);
      const { error } = await roleQuery.delete();

      if (error) throw error;

      setCustomRoles(prev => prev.filter(r => r.id !== roleId));
      setRolePermissions(prev => prev.filter(rp => rp.roleId !== roleId));
      
      toast({
        title: 'Role deleted',
        description: 'The custom role has been deleted.',
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Error deleting role',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  // Save permissions for a role
  const saveRolePermissions = useCallback(async (
    roleId: string, 
    permissions: Set<PermissionKey>
  ): Promise<boolean> => {
    try {
      setSaving(true);
      
      // Delete existing permissions
      const deleteQuery = api
        .from('role_permissions')
        .eq('roleId', roleId);
      await deleteQuery.delete();

      // Insert new permissions
      if (permissions.size > 0) {
        const permissionRows = Array.from(permissions).map(key => ({
          roleId: roleId,
          permissionKey: key as PermissionKey,
        }));

        const { error } = await api
          .from('role_permissions')
          .insert(permissionRows);

        if (error) throw error;
      }

      // Refresh permissions data
      const permResult = await api
        .from('role_permissions')
        .select('*')
        .eq('roleId', roleId);

      if (permResult.error) throw permResult.error;

      const newPerms = (permResult.data as RolePermission[]) || [];

      setRolePermissions(prev => [
        ...prev.filter(rp => rp.roleId !== roleId),
        ...newPerms,
      ]);

      toast({
        title: 'Permissions saved',
        description: 'Role permissions have been updated.',
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Error saving permissions',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  return {
    customRoles,
    rolePermissions,
    loading,
    saving,
    getRolePermissions,
    createRole,
    updateRole,
    deleteRole,
    saveRolePermissions,
    refetch: fetchData,
  };
}
