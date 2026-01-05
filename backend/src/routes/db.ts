import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../db/client.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { emitDatabaseChange } from '../realtime/emitter.js';

const router = Router();

// Type for Prisma query builder with where clause
interface PrismaQueryWithWhere {
  where: Record<string, unknown>;
  select?: Record<string, boolean>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  take?: number;
  skip?: number;
}

// Type for Prisma model delegate with common methods
type PrismaModelDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
  findMany: (args?: PrismaQueryWithWhere) => Promise<unknown[]>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
};


async function resolveBoardIdForTable(
  table: string,
  record: Record<string, unknown>
): Promise<string | undefined> {
  const getField = (camelCase: string, snakeCase: string): unknown => {
    return record[camelCase] ?? record[snakeCase];
  };

  const boardId = getField('boardId', 'board_id') as string | undefined;
  const cardId = getField('cardId', 'card_id') as string | undefined;
  const columnId = getField('columnId', 'column_id') as string | undefined;

  // Direct boardId
  if (boardId) {
    return boardId;
  }

  // Boards: id is boardId
  if (table === 'boards') {
    return (record.id || record.userId) as string | undefined;
  }

  // Columns: columnId → boardId
  if (table === 'columns' && columnId) {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: { boardId: true },
    });
    return column?.boardId;
  }

  // Cards: cardId → column → boardId
  if (table === 'cards' && cardId) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { column: { select: { boardId: true } } },
    });
    return card?.column?.boardId;
  }

  // Card detail tables: cardId → column → boardId
  if (table.startsWith('card_') && cardId) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { column: { select: { boardId: true } } },
    });
    return card?.column?.boardId;
  }

  // Board members: boardId is direct
  if (table === 'boardMembers' || table === 'board_members') {
    return boardId;
  }

  return undefined;
}

// Apply auth middleware to all routes
router.use(authMiddleware);


// Parse query parameters for Supabase-style filters
function parseFilters(query: Record<string, string>): Array<{ field: string; operator: string; value: unknown }> {
  const filters: Array<{ field: string; operator: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(query)) {
    // Skip special query parameters
    if (['select', 'order', 'limit', 'offset', 'count'].includes(key)) {
      continue;
    }

    // Parse Supabase-style filter: field=operator.value
    const match = value.match(/^([^.]+)\.(.+)$/);
    if (match) {
      const [, operator, filterValue] = match;
      filters.push({
        field: key,
        operator,
        value: filterValue === 'null' ? null : 
               filterValue === 'true' ? true :
               filterValue === 'false' ? false : filterValue,
      });
    } else {
      // Simple equality
      filters.push({
        field: key,
        operator: 'eq',
        value: value === 'null' ? null : 
               value === 'true' ? true :
               value === 'false' ? false : value,
      });
    }
  }

  return filters;
}

// Apply filters to Prisma query
function applyFilters(
  query: { where: Record<string, unknown> },
  filters: Array<{ field: string; operator: string; value: unknown }>
): void {
  for (const filter of filters) {
    const { field, operator, value } = filter;
    // Field names are already in camelCase

    switch (operator) {
      case 'eq':
        query.where[field] = value;
        break;
      case 'neq':
        query.where[field] = { not: value };
        break;
      case 'gt':
        query.where[field] = { gt: value };
        break;
      case 'gte':
        query.where[field] = { gte: value };
        break;
      case 'lt':
        query.where[field] = { lt: value };
        break;
      case 'lte':
        query.where[field] = { lte: value };
        break;
      case 'like':
        query.where[field] = { contains: value as string };
        break;
      case 'ilike':
        query.where[field] = { contains: value as string, mode: 'insensitive' };
        break;
      case 'in':
        query.where[field] = { in: Array.isArray(value) ? value : [value] };
        break;
      case 'is':
        if (value === null) {
          query.where[field] = null;
        } else {
          query.where[field] = value;
        }
        break;
    }
  }
}

// Map table names to Prisma models
const tableModelMap: Record<string, string> = {
  workspaces: 'workspace',
  boards: 'board',
  columns: 'column',
  cards: 'card',
  labels: 'label',
  card_labels: 'cardLabel',
  card_attachments: 'cardAttachment',
  card_subtasks: 'cardSubtask',
  card_assignees: 'cardAssignee',
  board_members: 'boardMember',
  workspace_members: 'workspaceMember',
  board_themes: 'boardTheme',
  app_settings: 'appSettings',
  custom_fonts: 'customFont',
  custom_roles: 'customRole',
  role_permissions: 'rolePermission',
  board_member_custom_roles: 'boardMemberCustomRole',
  board_invite_tokens: 'boardInviteToken',
  board_member_audit_log: 'boardMemberAuditLog',
  import_pending_assignees: 'importPendingAssignee',
  import_pending_attachments: 'importPendingAttachment',
  mysql_config: 'mysqlConfig',
  profiles: 'profile',
};

// GET /api/db/:table - Query table
router.get('/:table', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { table } = req.params;
    const modelName = tableModelMap[table];

    if (!modelName) {
      throw new ValidationError(`Unknown table: ${table}`);
    }

    const model = (prisma as unknown as Record<string, PrismaModelDelegate>)[String(modelName)] as PrismaModelDelegate | undefined;
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    // Parse query parameters
    const filters = parseFilters(req.query as Record<string, string>);
    const selectFields = req.query.select as string | undefined;
    const orderBy = req.query.order as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const countOnly = req.query.count === 'true' || req.query.count === '1';

    // Build query
    const query: PrismaQueryWithWhere = {
      where: {},
    };

    // Apply filters
    applyFilters(query, filters);

    // If count only, use count() method (much more efficient)
    if (countOnly) {
      const count = await model.count({ where: query.where });
      return res.json(count);
    }

    // Apply select - field names are already in camelCase
    if (selectFields && selectFields !== '*') {
      const fields = selectFields.split(',').map((f) => f.trim());
      query.select = fields.reduce((acc, field) => {
        acc[field] = true;
        return acc;
      }, {} as Record<string, boolean>);
    }

    // Apply order - field names are already in camelCase
    if (orderBy) {
      const [field, direction] = orderBy.split('.');
      query.orderBy = {
        [field]: direction === 'asc' ? 'asc' : 'desc',
      };
    }

    // Apply limit and offset
    if (limit !== undefined) {
      query.take = limit;
    }
    if (offset !== undefined) {
      query.skip = offset;
    }

    // Execute query
    const data = await model.findMany(query);

    return res.json(data);
  } catch (error: unknown) {
    // Log error details for debugging
    console.error(`[DB Route] Error querying table ${req.params.table}:`, error);
    if (error instanceof Error) {
      console.error(`[DB Route] Error message: ${error.message}`);
      console.error(`[DB Route] Error stack: ${error.stack}`);
    }
    return next(error);
  }
});

// POST /api/db/:table - Insert records
router.post('/:table', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { table } = req.params;
    const modelName = tableModelMap[table];

    if (!modelName) {
      throw new ValidationError(`Unknown table: ${table}`);
    }

    const model = (prisma as unknown as Record<string, PrismaModelDelegate>)[String(modelName)] as PrismaModelDelegate | undefined;
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    const body = req.body;
    const data = Array.isArray(body) ? body : [body];

    // Insert records - data is already in camelCase
    // Prisma returns records in camelCase format automatically
    const results = await Promise.all(
      data.map((record) => model.create({ data: record }))
    );

    // Emit realtime events for each inserted record
    // Wrap in try-catch to ensure DB operation succeeds even if realtime fails
    for (const result of results) {
      try {
        // Resolve boardId and workspaceId for proper channel routing
        const boardId = await resolveBoardIdForTable(table, result as Record<string, unknown>);
        
        // Emit INSERT event - Prisma records are already in camelCase
        await emitDatabaseChange(
          table,
          'INSERT',
          result as Record<string, unknown>,
          undefined,
          boardId
        );
      } catch (realtimeError) {
        // Log warning but don't block the operation
        console.warn(`[DB Route] Failed to emit realtime event for ${table} INSERT:`, realtimeError);
      }
    }

    res.status(201).json(Array.isArray(body) ? results : results[0]);
  } catch (error: unknown) {
    next(error);
  }
});

// PATCH /api/db/:table - Update records
router.patch('/:table', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { table } = req.params;
    const modelName = tableModelMap[table];

    if (!modelName) {
      throw new ValidationError(`Unknown table: ${table}`);
    }

    const model = (prisma as unknown as Record<string, PrismaModelDelegate>)[String(modelName)] as PrismaModelDelegate | undefined;
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    // Parse filters from query
    const filters = parseFilters(req.query as Record<string, string>);

    // Build where clause
    const where: Record<string, unknown> = {};
    applyFilters({ where }, filters);

    // Update data is already in camelCase
    const updateData = req.body;

    // Fetch old records before update for event emission
    // Prisma returns records in camelCase format automatically
    const oldRecords = await model.findMany({ where });

    // Update records
    const result = await model.updateMany({
      where,
      data: updateData,
    });

    // Fetch updated records after update for event emission
    const updatedRecords = await model.findMany({ where });

    // Emit realtime events for each updated record
    // Match old and new records by ID (or userId for some tables)
    for (const updated of updatedRecords) {
      try {
        const updatedRecord = updated as Record<string, unknown>;
        // Find matching old record
        const oldRecord = (oldRecords as unknown[]).find((old): old is Record<string, unknown> => {
          const oldRecord = old as Record<string, unknown>;
          // Match by id or userId depending on table type
          if (oldRecord.id && updatedRecord.id) {
            return oldRecord.id === updatedRecord.id;
          }
          if (oldRecord.userId && updatedRecord.userId) {
            return oldRecord.userId === updatedRecord.userId;
          }
          return false;
        });

        if (oldRecord) {
          // Resolve boardId for proper channel routing
          const boardId = await resolveBoardIdForTable(table, updatedRecord);
          
          // Emit UPDATE event - both records are in camelCase from Prisma
          await emitDatabaseChange(
            table,
            'UPDATE',
            updatedRecord,
            oldRecord,
            boardId
          );
        }
      } catch (realtimeError) {
        // Log warning but don't block the operation
        console.warn(`[DB Route] Failed to emit realtime event for ${table} UPDATE:`, realtimeError);
      }
    }

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// DELETE /api/db/:table - Delete records
router.delete('/:table', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { table } = req.params;
    const modelName = tableModelMap[table];

    if (!modelName) {
      throw new ValidationError(`Unknown table: ${table}`);
    }

    const model = (prisma as unknown as Record<string, PrismaModelDelegate>)[String(modelName)] as PrismaModelDelegate | undefined;
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    // Parse filters from query
    const filters = parseFilters(req.query as Record<string, string>);

    // Build where clause
    const where: Record<string, unknown> = {};
    applyFilters({ where }, filters);

    // Safety check: prevent deleting all records (empty where clause)
    if (Object.keys(where).length === 0) {
      throw new ValidationError('Delete operation requires at least one filter to prevent accidental deletion of all records');
    }

    // Fetch records before deletion for event emission
    // Prisma returns records in camelCase format automatically
    const recordsToDelete = await model.findMany({ where });

    // Delete records
    const result = await model.deleteMany({ where });

    // Emit realtime events for each deleted record
    for (const record of recordsToDelete) {
      try {
        // Resolve boardId for proper channel routing
        const boardId = await resolveBoardIdForTable(table, record as Record<string, unknown>);
        
        // Emit DELETE event - record is in camelCase from Prisma
        await emitDatabaseChange(
          table,
          'DELETE',
          undefined,
          record as Record<string, unknown>,
          boardId
        );
      } catch (realtimeError) {
        // Log warning but don't block the operation
        console.warn(`[DB Route] Failed to emit realtime event for ${table} DELETE:`, realtimeError);
      }
    }

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;

