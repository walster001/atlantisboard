import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import {
  registerBoardCollectionRoutes,
  registerBoardDeleteRoute,
  registerBoardItemReadUpdateRoutes,
} from './boardCrudRoutes.js';
import { registerSnapshotsRoutes } from './snapshotsRoutes.js';
import { registerBulkColorRoutes } from './bulkColorRoutes.js';
import { registerPermissionsRoutes } from './permissionsRoutes.js';
import {
  registerMemberManagementRoutes,
  registerMembersListRoute,
} from './membersRoutes.js';
import { registerReorderRoutes } from './reorderRoutes.js';
import { registerBackgroundImageRoutes } from './backgroundImageRoutes.js';
import { registerActivityRoundupRoutes } from './activityRoundupRoutes.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

registerBoardCollectionRoutes(router);
registerSnapshotsRoutes(router);
registerBulkColorRoutes(router);
registerPermissionsRoutes(router);
registerMembersListRoute(router);
registerReorderRoutes(router);
registerBoardItemReadUpdateRoutes(router);
registerActivityRoundupRoutes(router);
registerBackgroundImageRoutes(router);
registerMemberManagementRoutes(router);
registerBoardDeleteRoute(router);

export { router as boardRoutes };
