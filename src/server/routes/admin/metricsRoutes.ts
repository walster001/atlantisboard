import type { Router } from 'express';
import { getAdminSystemMetricsSnapshot } from '../../services/systemMetricsService.js';

export function registerMetricsRoutes(router: Router): void {
  router.get('/system/metrics', async (_req, res, next) => {
    try {
      const metrics = await getAdminSystemMetricsSnapshot();
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  });
}
