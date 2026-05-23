import type { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { DATABASE_CLEANUP_CATEGORY_IDS } from '../../../shared/types/adminDatabaseMaintenance.js';
import {
  getDatabaseMaintenanceSnapshot,
  listSafeCleanupCategoryIds,
  runDatabaseCleanup,
} from '../../services/databaseMaintenanceService.js';

const cleanupBodySchema = z.object({
  categories: z
    .array(z.enum(DATABASE_CLEANUP_CATEGORY_IDS))
    .min(1)
    .max(DATABASE_CLEANUP_CATEGORY_IDS.length),
});

export function registerDatabaseMaintenanceRoutes(router: Router): void {
  router.get('/database/stats', async (_req, res, next) => {
    try {
      const snapshot = await getDatabaseMaintenanceSnapshot();
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.get('/database/safe-cleanup-categories', (_req, res) => {
    res.json({ categories: listSafeCleanupCategoryIds() });
  });

  router.post('/database/cleanup', async (req, res, next) => {
    try {
      const parsed = cleanupBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid cleanup request', details: parsed.error.flatten() });
        return;
      }
      const authReq = req as AuthenticatedRequest;
      const result = await runDatabaseCleanup(parsed.data.categories, authReq.user.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
