import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import { workspaceCrudRoutes } from './crud.js';
import { workspaceMembersRoutes } from './members.js';
import { workspaceSettingsRoutes } from './settings.js';

const router = Router();

// All routes require authentication
router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

router.use(workspaceSettingsRoutes);
router.use(workspaceMembersRoutes);
router.use(workspaceCrudRoutes);

export { router as workspaceRoutes };
