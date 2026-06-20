import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { loadThemeCatalogForContext } from '../services/boardThemeService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

router.get('/', async (_req, res, next) => {
  try {
    const catalog = await loadThemeCatalogForContext();
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
