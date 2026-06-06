import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import { importAtlantisboardRoutes } from './atlantisboard.js';
import { importCsvRoutes } from './csv.js';
import { importJobsRoutes } from './jobs.js';
import { importTrelloRoutes } from './trello.js';
import { importWekanRoutes } from './wekan.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

router.use(importTrelloRoutes);
router.use(importWekanRoutes);
router.use(importAtlantisboardRoutes);
router.use(importCsvRoutes);
router.use(importJobsRoutes);

export { router as importRoutes };
