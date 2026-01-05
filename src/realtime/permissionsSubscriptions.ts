import { logRealtime } from './logger';
import { SubscriptionCleanup, RealtimePostgresChangesPayload } from './realtimeClient';
import { subscribeWorkspaceViaRegistry } from './workspaceSubscriptions';
import { getSubscriptionRegistry } from './subscriptionRegistry';

interface PermissionHandlers {
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

interface BoardPermissionHandlers {
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onAffectsUser?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  currentUserId?: string;
}

export function subscribeCustomRoles(handlers: PermissionHandlers): SubscriptionCleanup {
  const topic = 'permissions-custom-roles';
  const registry = getSubscriptionRegistry();
  
  return registry.subscribeGlobal(
    topic,
    'custom_roles',
    '*',
    (payload) => {
      logRealtime(topic, `custom_roles ${payload.eventType}`, { id: payload.new?.id ?? payload.old?.id });
      handlers.onChange?.(payload);
    }
  );
}

export function subscribeRolePermissions(handlers: PermissionHandlers): SubscriptionCleanup {
  const topic = 'permissions-role-permissions';
  const registry = getSubscriptionRegistry();
  
  return registry.subscribeGlobal(
    topic,
    'role_permissions',
    '*',
    (payload) => {
      logRealtime(topic, `role_permissions ${payload.eventType}`, { roleId: payload.new?.roleId ?? payload.old?.roleId });
      handlers.onChange?.(payload);
    }
  );
}

export function subscribeBoardMemberCustomRoles(boardId: string | null | undefined, handlers: BoardPermissionHandlers): SubscriptionCleanup {
  const topic = `permissions-member-custom-roles${boardId ? `-${boardId}` : ''}`;
  const filter = boardId ? `boardId=eq.${boardId}` : undefined;
  const registry = getSubscriptionRegistry();

  return registry.subscribeGlobal(
    topic,
    'board_member_custom_roles',
    '*',
    (payload) => {
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
    filter
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

  // Use workspace subscription via registry instead of direct subscribeToChanges
  // This prevents duplicate subscriptions and WebSocket disconnects
  const topic = `workspace:${workspaceId}`;

  // Store and return the actual cleanup function from subscribeWorkspaceViaRegistry
  const cleanup = subscribeWorkspaceViaRegistry(workspaceId, {
    onMemberUpdate: (member, event) => {
      // Filter by boardId within the handler
      const memberData = member as { boardId?: string; userId?: string } | undefined;
      if (memberData?.boardId !== boardId) {
        return; // Not for this board, skip
      }

      // Convert to RealtimePostgresChangesPayload format for handlers
      const payload: RealtimePostgresChangesPayload<Record<string, unknown>> = {
        eventType: event.eventType,
        table: event.table,
        new: event.new as unknown as Record<string, unknown> | null,
        old: event.old as unknown as Record<string, unknown> | null,
      };

      logRealtime(topic, `boardMembers ${event.eventType}`, { id: memberData?.userId, boardId });
      handlers.onChange?.(payload);
      const userId = handlers.currentUserId;
      if (userId && memberData?.userId === userId) {
        handlers.onAffectsUser?.(payload);
      }
    },
  });

  // Return the actual cleanup function to allow proper cleanup
  return cleanup;
}

