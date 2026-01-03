import { logRealtime } from './logger';
import { subscribeToChanges, SubscriptionCleanup, RealtimePostgresChangesPayload } from './realtimeClient';

type DbRecord = Record<string, unknown>;

type PermissionHandlers = {
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
};

type BoardPermissionHandlers = {
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onAffectsUser?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
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
  const filter = boardId ? `boardId=eq.${boardId}` : undefined;

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
            const record = (payload.new || payload.old) as { userId?: string } | undefined;
            if (record?.userId === userId) {
              handlers.onAffectsUser?.(payload);
            }
          }
        },
      },
    ]
  );
}

export function subscribeBoardMembersForPermissions(
  boardId: string | null | undefined,
  workspaceId: string | null | undefined,
  handlers: BoardPermissionHandlers
): SubscriptionCleanup {
  if (!boardId || !workspaceId) {
    // Return no-op cleanup to keep callsites simple
    return () => {};
  }

  // Use workspace channel instead of board-specific channel
  const topic = `workspace:${workspaceId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'UPDATE',
        table: 'boardMembers',
        handler: (payload) => {
          // Filter by boardId within the handler
          const member = payload.new as { boardId?: string; userId?: string } | undefined;
          if (member?.boardId !== boardId) {
            return; // Not for this board, skip
          }
          
          logRealtime(topic, 'boardMembers update', { id: member?.userId, boardId });
          handlers.onChange?.(payload);
          const userId = handlers.currentUserId;
          if (userId && member?.userId === userId) {
            handlers.onAffectsUser?.(payload);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'boardMembers',
        handler: (payload) => {
          // Filter by boardId within the handler
          const member = payload.old as { boardId?: string; userId?: string } | undefined;
          if (member?.boardId !== boardId) {
            return; // Not for this board, skip
          }
          
          logRealtime(topic, 'boardMembers delete', { id: member?.userId, boardId });
          handlers.onChange?.(payload);
          const userId = handlers.currentUserId;
          if (userId && member?.userId === userId) {
            handlers.onAffectsUser?.(payload);
          }
        },
      },
    ]
  );
}

