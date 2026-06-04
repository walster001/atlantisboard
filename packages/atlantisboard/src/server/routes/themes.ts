import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../types/express.js';
import { loadThemeCatalogForContext } from '../services/boardThemeService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const catalog = await loadThemeCatalogForContext(authReq.user.id);
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
