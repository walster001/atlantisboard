import type { Router } from 'express';
import { getAdminSystemMetricsSnapshot, getMetricsHistory } from '../../services/systemMetricsService.js';

export function registerMetricsRoutes(router: Router): void {
  router.get('/system/metrics', async (_req, res, next) => {
    try {
      const metrics = await getAdminSystemMetricsSnapshot();
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  });

  router.get('/system/metrics/history', (_req, res) => {
    res.json(getMetricsHistory());
  });
}
