import { logger } from './logger.js';

export interface AuditLogEntry {
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string | undefined;
  ipAddress?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  timestamp: Date;
}

function cloneMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }
  try {
    return structuredClone(metadata) as Record<string, unknown>;
  } catch {
    return { ...metadata };
  }
}

function snapshotAuditEntry(entry: AuditLogEntry): AuditLogEntry {
  return {
    userId: entry.userId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    ipAddress: entry.ipAddress,
    metadata: cloneMetadata(entry.metadata),
    timestamp: new Date(entry.timestamp.getTime()),
  };
}

/**
 * Schedules audit logging on the next event-loop turn so handlers and DB work are
 * not blocked by synchronous pino / pino-pretty serialization on the hot path.
 *
 * TODO(AC-003): Persist audit events to a MongoDB collection with TTL/retention instead of
 * log-only emission; add a background job for archival and compliance export.
 */
function auditStdoutEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  const flag = process.env.AUDIT_LOG_STDOUT?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function logAuditEvent(entry: AuditLogEntry): void {
  if (!auditStdoutEnabled()) {
    return;
  }
  const snap = snapshotAuditEntry(entry);
  setImmediate(() => {
    try {
      logger.info(
        {
          audit: true,
          userId: snap.userId,
          action: snap.action,
          resourceType: snap.resourceType,
          resourceId: snap.resourceId,
          ipAddress: snap.ipAddress,
          metadata: snap.metadata,
          timestamp: snap.timestamp.toISOString(),
        },
        `Audit: ${snap.action} on ${snap.resourceType}`,
      );
    } catch (error) {
      logger.error(
        { error, auditAction: snap.action, resourceType: snap.resourceType },
        'Deferred audit log failed',
      );
    }
  });
}

