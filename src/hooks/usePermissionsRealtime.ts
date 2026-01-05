/**
 * usePermissionsRealtime Hook
 * 
 * Subscribes to real-time changes in permission-related tables and triggers
 * recalculation of user permissions when changes occur.
 * 
 * Monitors:
 * - custom_roles: Role definitions
 * - role_permissions: Permission assignments to roles
 * - board_member_custom_roles: Custom role assignments to users
 * - board_members: Legacy role changes
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  subscribeBoardMemberCustomRoles,
  subscribeBoardMembersForPermissions,
  subscribeCustomRoles,
  subscribeRolePermissions,
} from '@/realtime/permissionsSubscriptions';
import type { RealtimePostgresChangesPayload } from '@/integrations/api/realtime';

interface UsePermissionsRealtimeOptions {
  boardId?: string | null;
  workspaceId?: string | null;
  /**
   * Callback when permissions are updated.
   * Use this to refetch board data or recalculate UI state.
   */
  onPermissionsUpdated?: () => void;
  /**
   * Callback when the user loses board.view permission.
   * If not provided, defaults to navigating to home.
   */
  onAccessRevoked?: () => void;
}

interface PermissionChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export function usePermissionsRealtime(options: UsePermissionsRealtimeOptions = {}) {
  const { boardId, workspaceId, onPermissionsUpdated, onAccessRevoked } = options;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Track last update to debounce rapid changes
  const lastUpdateRef = useRef<number>(0);
  const DEBOUNCE_MS = 500;

  const handlePermissionChange = useCallback((_payload: PermissionChangePayload) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < DEBOUNCE_MS) {
      return;
    }
    lastUpdateRef.current = now;
    
    // Notify that permissions have been updated
    if (onPermissionsUpdated) {
      onPermissionsUpdated();
    }
  }, [onPermissionsUpdated]);

  const handleAccessRevoked = useCallback(() => {
    console.log('[PermissionsRealtime] Access revoked, redirecting...');
    
    toast({
      title: 'Access removed',
      description: 'Your permissions for this board have been revoked.',
      variant: 'destructive',
    });

    if (onAccessRevoked) {
      onAccessRevoked();
    } else {
      navigate('/', {
        state: {
          permissionsRevoked: {
            boardId: boardId,
            timestamp: Date.now()
          }
        }
      });
    }
  }, [boardId, navigate, toast, onAccessRevoked]);

  // Store latest values in refs to prevent stale closures
  const userRef = useRef(user);
  const handlePermissionChangeRef = useRef(handlePermissionChange);
  const handleAccessRevokedRef = useRef(handleAccessRevoked);

  // Update refs when values change
  useEffect(() => {
    userRef.current = user;
    handlePermissionChangeRef.current = handlePermissionChange;
    handleAccessRevokedRef.current = handleAccessRevoked;
  }, [user, handlePermissionChange, handleAccessRevoked]);

  // Subscribe to custom_roles changes (global)
  useEffect(() => {
    if (!user) return;

    return subscribeCustomRoles({
      onChange: (payload) => {
        handlePermissionChange({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          table: 'custom_roles',
          new: payload.new as Record<string, unknown>,
          old: payload.old as Record<string, unknown>,
        });
      },
    });
  }, [user, handlePermissionChange]);

  // Subscribe to role_permissions changes (global)
  useEffect(() => {
    if (!user) return;

    return subscribeRolePermissions({
      onChange: (payload) => {
        handlePermissionChange({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          table: 'role_permissions',
          new: payload.new as Record<string, unknown>,
          old: payload.old as Record<string, unknown>,
        });
      },
    });
  }, [user, handlePermissionChange]);

  // Subscribe to board_member_custom_roles changes (board-specific if boardId provided)
  useEffect(() => {
    if (!user) return;

    // Create stable wrapper that accesses refs
    const stableOnChange = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      // Access latest values from refs
      const currentUser = userRef.current;
      const currentHandlePermissionChange = handlePermissionChangeRef.current;
      
      if (!currentUser) return;
      
      // Backend emits camelCase (userId), not snake_case (user_id)
      const record = (payload.new || payload.old) as { userId?: string } | undefined;
      if (record?.userId === currentUser.id) {
        if (payload.eventType === 'DELETE') {
          currentHandlePermissionChange({
            eventType: 'DELETE',
            table: 'boardMemberCustomRoles',
            old: payload.old as Record<string, unknown>,
          });
        } else {
          currentHandlePermissionChange({
            eventType: payload.eventType as 'INSERT' | 'UPDATE',
            table: 'boardMemberCustomRoles',
            new: payload.new as Record<string, unknown>,
          });
        }
      }
    };

    return subscribeBoardMemberCustomRoles(boardId, {
      currentUserId: user.id,
      onChange: stableOnChange,
    });
  }, [user, boardId, handlePermissionChange]);

  // Subscribe to board_members role changes (using workspace channel)
  useEffect(() => {
    if (!user || !boardId || !workspaceId) return;

    // Create stable wrappers that access refs
    const stableOnChange = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      // Access latest values from refs
      const currentUser = userRef.current;
      const currentHandlePermissionChange = handlePermissionChangeRef.current;
      
      if (!currentUser) return;
      
      // Backend emits camelCase (userId), not snake_case (user_id)
      const updatedMember = payload.new as { userId?: string; role?: string };
      if (updatedMember?.userId === currentUser.id) {
        console.log('[PermissionsRealtime] User role changed:', updatedMember.role);
        currentHandlePermissionChange({
          eventType: payload.eventType as 'UPDATE' | 'DELETE',
          table: 'boardMembers',
          new: payload.new as Record<string, unknown>,
          old: payload.old as Record<string, unknown>,
        });
      }
    };

    const stableOnAffectsUser = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      // Access latest value from ref
      const currentHandleAccessRevoked = handleAccessRevokedRef.current;
      
      if (payload.eventType === 'DELETE') {
        currentHandleAccessRevoked();
      }
    };

    return subscribeBoardMembersForPermissions(boardId, workspaceId, {
      currentUserId: user.id,
      onChange: stableOnChange,
      onAffectsUser: stableOnAffectsUser,
    });
  }, [user, boardId, workspaceId, handlePermissionChange, handleAccessRevoked]);

  return {
    // Expose method to manually trigger permission recalculation
    triggerUpdate: () => {
      if (onPermissionsUpdated) {
        onPermissionsUpdated();
      }
    },
  };
}

