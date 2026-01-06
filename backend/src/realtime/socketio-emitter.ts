import { getSocketIOServer } from './socketio-server.js';

/**
 * Normalize table name from snake_case to camelCase
 */
function normalizeTableName(tableName: string): string {
  return tableName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Determine entity metadata from table and records
 */
function determineEntityMetadata(
  table: string,
  newRecord?: Record<string, unknown>,
  oldRecord?: Record<string, unknown>,
  boardId?: string,
  workspaceId?: string
): {
  entityType: 'board' | 'column' | 'card' | 'cardDetail' | 'member' | 'workspace';
  entityId: string | undefined;
  parentId: string | undefined;
} {
  const record = newRecord || oldRecord;
  const recordObj = record as Record<string, unknown> | undefined;
  const entityId = recordObj?.id as string | undefined || recordObj?.userId as string | undefined;

  if (table === 'boards') {
    return { entityType: 'board', entityId, parentId: workspaceId };
  } else if (table === 'columns') {
    const columnBoardId = recordObj?.boardId as string | undefined || recordObj?.board_id as string | undefined || boardId;
    return { entityType: 'column', entityId, parentId: columnBoardId };
  } else if (table === 'cards') {
    const cardColumnId = recordObj?.columnId as string | undefined || recordObj?.column_id as string | undefined;
    return { entityType: 'card', entityId, parentId: cardColumnId };
  } else if (table.startsWith('card')) {
    // Handles both 'card_' (snake_case) and 'card' (camelCase) prefixes
    const cardId = recordObj?.cardId as string | undefined || recordObj?.card_id as string | undefined;
    return { entityType: 'cardDetail', entityId, parentId: cardId };
  } else if (table === 'boardMembers') {
    return { entityType: 'member', entityId, parentId: boardId };
  } else if (table === 'workspaceMembers' || table === 'workspaces') {
    return { entityType: 'workspace', entityId, parentId: undefined };
  }

  // Default fallback
  return { entityType: 'board', entityId, parentId: undefined };
}

/**
 * Emit database change event via Socket.IO
 */
export async function emitDatabaseChange(
  table: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  newRecord?: Record<string, unknown>,
  oldRecord?: Record<string, unknown>,
  boardId?: string
): Promise<void> {
  const server = getSocketIOServer();
  if (!server) {
    console.warn('[Socket.IO] Server not initialized, skipping event emission');
    return;
  }

  // Normalize table name to camelCase for consistency
  const normalizedTable = normalizeTableName(table);
  
  // Step 1: Resolve entity IDs from records
  const record = newRecord || oldRecord;
  const recordObj = record as Record<string, unknown> | undefined;
  const entityId = recordObj?.id as string | undefined || recordObj?.userId as string | undefined;
  
  let resolvedBoardId: string | undefined = boardId;
  let resolvedColumnId: string | undefined;
  let resolvedCardId: string | undefined;
  let resolvedWorkspaceId: string | undefined;

  // Resolve IDs based on table type (use normalized table name)
  if (normalizedTable === 'boards') {
    resolvedBoardId = entityId;
    resolvedWorkspaceId = recordObj?.workspaceId as string | undefined || recordObj?.workspace_id as string | undefined;
  } else if (normalizedTable === 'columns') {
    resolvedBoardId = recordObj?.boardId as string | undefined || recordObj?.board_id as string | undefined || boardId;
    resolvedColumnId = entityId;
  } else if (normalizedTable === 'cards') {
    resolvedColumnId = recordObj?.columnId as string | undefined || recordObj?.column_id as string | undefined;
    resolvedCardId = entityId;
  } else if (normalizedTable.startsWith('card')) {
    // Card details: attachments, subtasks, assignees, labels
    resolvedCardId = recordObj?.cardId as string | undefined || recordObj?.card_id as string | undefined;
  } else if (normalizedTable === 'boardMembers') {
    resolvedBoardId = recordObj?.boardId as string | undefined || recordObj?.board_id as string | undefined || boardId;
  } else if (normalizedTable === 'workspaceMembers' || normalizedTable === 'workspaces') {
    resolvedWorkspaceId = recordObj?.workspaceId as string | undefined || recordObj?.workspace_id as string | undefined || entityId;
  }

  // Step 2: Resolve workspaceId using server's cached resolver
  if (!resolvedWorkspaceId) {
    resolvedWorkspaceId = await server.resolveWorkspaceId(
      entityId,
      resolvedBoardId,
      resolvedColumnId,
      resolvedCardId
    );
  }

  // Step 3: Determine entity metadata
  const { entityType, parentId } = determineEntityMetadata(
    normalizedTable,
    newRecord,
    oldRecord,
    resolvedBoardId,
    resolvedWorkspaceId
  );

  // Step 4: Build channels - ALWAYS emit to workspace channel first (parent-child model)
  const channels: string[] = [];
  
  // Primary channel: workspace (parent-child hierarchy)
  if (resolvedWorkspaceId) {
    channels.push(`workspace:${resolvedWorkspaceId}`);
  }

  // Special handling for workspace membership and workspace changes
  if (normalizedTable === 'workspaceMembers') {
    const workspaceRecord = (newRecord || oldRecord) as { workspaceId?: string; userId?: string };
    if (workspaceRecord?.workspaceId) {
      if (!channels.includes(`workspace:${workspaceRecord.workspaceId}`)) {
        channels.push(`workspace:${workspaceRecord.workspaceId}`);
      }
    }
    // Emit to user-specific channels
    if (workspaceRecord?.userId) {
      channels.push(`user:${workspaceRecord.userId}`);
    }
    channels.push('global');
  } else if (normalizedTable === 'workspaces') {
    channels.push('global');
  } else if (!resolvedWorkspaceId && !resolvedBoardId) {
    // Global channel for app-level changes
    channels.push('global');
  }

  // Step 5: Invalidate access cache when boardMembers change
  if (normalizedTable === 'boardMembers' && resolvedBoardId) {
    server.invalidateAccessCache(resolvedBoardId);
  }

  // Step 6: Build payload
  let payload: Record<string, unknown>;
  
  if (event === 'UPDATE' && newRecord && oldRecord) {
    // Include full records for compatibility
    payload = {
      id: entityId,
      entityType,
      parentId,
      workspaceId: resolvedWorkspaceId,
      new: newRecord,
      old: oldRecord,
    };
  } else if (event === 'DELETE' && oldRecord) {
    payload = {
      id: entityId,
      entityType,
      parentId,
      workspaceId: resolvedWorkspaceId,
      old: oldRecord,
    };
  } else {
    // INSERT or fallback: send full record
    payload = {
      new: newRecord,
      old: oldRecord,
      entityType,
      entityId,
      parentId,
      workspaceId: resolvedWorkspaceId,
    };
  }

  // Step 7: Broadcast to all channels via Socket.IO rooms
  const io = server.getIO();
  for (const channel of channels) {
    io.to(channel).emit('database_change', {
      event,
      table: normalizedTable,
      payload,
    });
  }
}

/**
 * Emit custom event via Socket.IO
 */
export async function emitCustomEvent(
  channel: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const server = getSocketIOServer();
  if (!server) {
    console.warn('[Socket.IO] Server not initialized, skipping custom event emission');
    return;
  }

  const io = server.getIO();
  io.to(channel).emit('custom_event', {
    type: eventType,
    payload,
  });
}

