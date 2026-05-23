import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { loadThemeCatalogForContext } from '../services/boardThemeService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

const listQuerySchema = z.object({
  boardId: z.string().min(1).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = listQuerySchema.parse(req.query);
    const catalog = await loadThemeCatalogForContext(authReq.user.id, query.boardId);
    res.json({
      systemThemes: catalog.systemThemes,
      customThemes: catalog.customThemes,
      themes: [...catalog.systemThemes, ...catalog.customThemes],
    });
  } catch (error) {
    next(error);
  }
});

export { router as themesRoutes };
