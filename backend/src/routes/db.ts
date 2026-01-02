import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../db/client.js';
import { ValidationError } from '../middleware/errorHandler.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);


// Parse query parameters for Supabase-style filters
function parseFilters(query: Record<string, string>) {
  const filters: Array<{ field: string; operator: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(query)) {
    // Skip special query parameters
    if (['select', 'order', 'limit', 'offset'].includes(key)) {
      continue;
    }

    // Parse Supabase-style filter: field=operator.value
    const match = value.match(/^([^.]+)\.(.+)$/);
    if (match) {
      const [, operator, filterValue] = match;
      filters.push({
        field: key,
        operator,
        value: filterValue === 'null' ? null : filterValue,
      });
    } else {
      // Simple equality
      filters.push({
        field: key,
        operator: 'eq',
        value: value === 'null' ? null : value,
      });
    }
  }

  return filters;
}

// Apply filters to Prisma query
function applyFilters(
  query: any,
  filters: Array<{ field: string; operator: string; value: unknown }>
) {
  for (const filter of filters) {
    const { field, operator, value } = filter;
    // Field names are already in camelCase

    switch (operator) {
      case 'eq':
        query.where = { ...query.where, [field]: value };
        break;
      case 'neq':
        query.where = { ...query.where, [field]: { not: value } };
        break;
      case 'gt':
        query.where = { ...query.where, [field]: { gt: value } };
        break;
      case 'gte':
        query.where = { ...query.where, [field]: { gte: value } };
        break;
      case 'lt':
        query.where = { ...query.where, [field]: { lt: value } };
        break;
      case 'lte':
        query.where = { ...query.where, [field]: { lte: value } };
        break;
      case 'like':
        query.where = { ...query.where, [field]: { contains: value as string } };
        break;
      case 'ilike':
        query.where = { ...query.where, [field]: { contains: value as string, mode: 'insensitive' } };
        break;
      case 'in':
        query.where = { ...query.where, [field]: { in: Array.isArray(value) ? value : [value] } };
        break;
      case 'is':
        if (value === null) {
          query.where = { ...query.where, [field]: null };
        } else {
          query.where = { ...query.where, [field]: value };
        }
        break;
    }
  }
}

// Map table names to Prisma models
const tableModelMap: Record<string, keyof typeof prisma> = {
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

    const model = (prisma as any)[modelName];
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    // Parse query parameters
    const filters = parseFilters(req.query as Record<string, string>);
    const selectFields = req.query.select as string | undefined;
    const orderBy = req.query.order as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

    // Build query
    const query: any = {
      where: {},
    };

    // Apply filters
    applyFilters(query, filters);

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

    res.json(data);
  } catch (error) {
    // Log error details for debugging
    console.error(`[DB Route] Error querying table ${req.params.table}:`, error);
    if (error instanceof Error) {
      console.error(`[DB Route] Error message: ${error.message}`);
      console.error(`[DB Route] Error stack: ${error.stack}`);
    }
    next(error);
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

    const model = (prisma as any)[modelName];
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    const body = req.body;
    const data = Array.isArray(body) ? body : [body];

    // Insert records - data is already in camelCase
    const results = await Promise.all(
      data.map((record) => model.create({ data: record }))
    );

    res.status(201).json(Array.isArray(body) ? results : results[0]);
  } catch (error) {
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

    const model = (prisma as any)[modelName];
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    // Parse filters from query
    const filters = parseFilters(req.query as Record<string, string>);

    // Build where clause
    const where: any = {};
    applyFilters({ where }, filters);

    // Update data is already in camelCase
    const updateData = req.body;

    // Update records
    const result = await model.updateMany({
      where,
      data: updateData,
    });

    res.json(result);
  } catch (error) {
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

    const model = (prisma as any)[modelName];
    if (!model) {
      throw new ValidationError(`Model not found: ${String(modelName)}`);
    }

    // Parse filters from query
    const filters = parseFilters(req.query as Record<string, string>);

    // Build where clause
    const where: any = {};
    applyFilters({ where }, filters);

    // Delete records
    const result = await model.deleteMany({ where });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

