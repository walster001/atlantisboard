import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import { registerCardCollectionRoutes, registerCardItemRoutes } from './crudRoutes.js';
import { registerCardReorderRoutes } from './reorderRoutes.js';
import { registerCardAssigneesRoutes } from './assigneesRoutes.js';
import { registerCardRemindersRoutes } from './remindersRoutes.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

registerCardCollectionRoutes(router);
registerCardReorderRoutes(router);
registerCardItemRoutes(router);
registerCardAssigneesRoutes(router);
registerCardRemindersRoutes(router);

export { router as cardRoutes };
