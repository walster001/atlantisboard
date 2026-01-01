import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logRealtime } from './logger';
import { subscribeToChanges, SubscriptionCleanup } from './realtimeClient';

type DbRecord = Record<string, unknown>;

type PermissionHandlers = {
  onChange?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
};

type BoardPermissionHandlers = {
  onChange?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
  onAffectsUser?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
  currentUserId?: string;
};

export function subscribeCustomRoles(handlers: PermissionHandlers): SubscriptionCleanup {
  const topic = 'permissions-custom-roles';
  return subscribeToChanges(
    topic,
    [
      {
        event: '*',
        table: 'custom_roles',
        handler: (payload) => {
          logRealtime(topic, `custom_roles ${payload.eventType}`, { id: payload.new?.id ?? payload.old?.id });
          handlers.onChange?.(payload);
        },
      },
    ]
  );
}

export function subscribeRolePermissions(handlers: PermissionHandlers): SubscriptionCleanup {
  const topic = 'permissions-role-permissions';
  return subscribeToChanges(
    topic,
    [
      {
        event: '*',
        table: 'role_permissions',
        handler: (payload) => {
          logRealtime(topic, `role_permissions ${payload.eventType}`, { role_id: payload.new?.role_id ?? payload.old?.role_id });
          handlers.onChange?.(payload);
        },
      },
    ]
  );
}

export function subscribeBoardMemberCustomRoles(boardId: string | null | undefined, handlers: BoardPermissionHandlers): SubscriptionCleanup {
  const topic = `permissions-member-custom-roles${boardId ? `-${boardId}` : ''}`;
  const filter = boardId ? `board_id=eq.${boardId}` : undefined;

  return subscribeToChanges(
    topic,
    [
      {
        event: '*',
        table: 'board_member_custom_roles',
        ...(filter ? { filter } : {}),
        handler: (payload) => {
          logRealtime(topic, `board_member_custom_roles ${payload.eventType}`, { id: payload.new?.id ?? payload.old?.id });
          handlers.onChange?.(payload);
          const userId = handlers.currentUserId;
          if (userId) {
            const record = (payload.new || payload.old) as { user_id?: string } | undefined;
            if (record?.user_id === userId) {
              handlers.onAffectsUser?.(payload);
            }
          }
        },
      },
    ]
  );
}

export function subscribeBoardMembersForPermissions(boardId: string | null | undefined, handlers: BoardPermissionHandlers): SubscriptionCleanup {
  if (!boardId) {
    // Return no-op cleanup to keep callsites simple
    return () => {};
  }

  const topic = `permissions-board-members-${boardId}`;
  const filter = `board_id=eq.${boardId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'UPDATE',
        table: 'board_members',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'board_members update', { id: payload.new?.id });
          handlers.onChange?.(payload);
          const userId = handlers.currentUserId;
          if (userId && (payload.new as { user_id?: string } | undefined)?.user_id === userId) {
            handlers.onAffectsUser?.(payload);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'board_members',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'board_members delete', { id: payload.old?.id });
          handlers.onChange?.(payload);
          const userId = handlers.currentUserId;
          if (userId && (payload.old as { user_id?: string } | undefined)?.user_id === userId) {
            handlers.onAffectsUser?.(payload);
          }
        },
      },
    ]
  );
}

