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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface UsePermissionsRealtimeOptions {
  boardId?: string | null;
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
  const { boardId, onPermissionsUpdated, onAccessRevoked } = options;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Track last update to debounce rapid changes
  const lastUpdateRef = useRef<number>(0);
  const DEBOUNCE_MS = 500;

  const handlePermissionChange = useCallback((payload: PermissionChangePayload) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < DEBOUNCE_MS) {
      return;
    }
    lastUpdateRef.current = now;

    console.log('[PermissionsRealtime] Permission change detected:', payload.table, payload.eventType);
    
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
            board_id: boardId,
            timestamp: Date.now()
          }
        }
      });
    }
  }, [boardId, navigate, toast, onAccessRevoked]);

  // Subscribe to custom_roles changes (global)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('permissions-custom-roles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'custom_roles',
        },
        (payload) => {
          handlePermissionChange({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'custom_roles',
            new: payload.new as Record<string, unknown>,
            old: payload.old as Record<string, unknown>,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, handlePermissionChange]);

  // Subscribe to role_permissions changes (global)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('permissions-role-permissions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'role_permissions',
        },
        (payload) => {
          handlePermissionChange({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'role_permissions',
            new: payload.new as Record<string, unknown>,
            old: payload.old as Record<string, unknown>,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, handlePermissionChange]);

  // Subscribe to board_member_custom_roles changes (board-specific if boardId provided)
  useEffect(() => {
    if (!user) return;

    const filter = boardId ? `board_id=eq.${boardId}` : undefined;

    const channel = supabase
      .channel(`permissions-member-custom-roles${boardId ? `-${boardId}` : ''}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'board_member_custom_roles',
          ...(filter && { filter }),
        },
        (payload) => {
          const record = (payload.new || payload.old) as { user_id?: string } | undefined;
          
          // Check if this affects the current user
          if (record?.user_id === user.id) {
            if (payload.eventType === 'DELETE') {
              // User's custom role was removed - might affect their permissions
              handlePermissionChange({
                eventType: 'DELETE',
                table: 'board_member_custom_roles',
                old: payload.old as Record<string, unknown>,
              });
            } else {
              handlePermissionChange({
                eventType: payload.eventType as 'INSERT' | 'UPDATE',
                table: 'board_member_custom_roles',
                new: payload.new as Record<string, unknown>,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, boardId, handlePermissionChange]);

  // Subscribe to board_members role changes (board-specific)
  useEffect(() => {
    if (!user || !boardId) return;

    const channel = supabase
      .channel(`permissions-board-members-${boardId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'board_members',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const updatedMember = payload.new as { user_id?: string; role?: string };
          
          if (updatedMember?.user_id === user.id) {
            console.log('[PermissionsRealtime] User role changed:', updatedMember.role);
            handlePermissionChange({
              eventType: 'UPDATE',
              table: 'board_members',
              new: payload.new as Record<string, unknown>,
              old: payload.old as Record<string, unknown>,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'board_members',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const deletedMember = payload.old as { user_id?: string };
          
          if (deletedMember?.user_id === user.id) {
            // Current user was removed from the board
            handleAccessRevoked();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, boardId, handlePermissionChange, handleAccessRevoked]);

  return {
    // Expose method to manually trigger permission recalculation
    triggerUpdate: () => {
      if (onPermissionsUpdated) {
        onPermissionsUpdated();
      }
    },
  };
}
