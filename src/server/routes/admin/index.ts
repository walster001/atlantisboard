import { Router, type RequestHandler } from 'express';
import { requireAuth, requireAppAdmin } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import { adminBackupRoutes } from '../adminBackupRoutes.js';
import { registerAppAdminRoutes } from './appAdminRoutes.js';
import { registerBrandingRoutes } from './brandingRoutes.js';
import { registerConfigRoutes } from './configRoutes.js';
import { registerFontsRoutes } from './fontsRoutes.js';
import { registerDatabaseMaintenanceRoutes } from './databaseMaintenanceRoutes.js';
import { registerMetricsRoutes } from './metricsRoutes.js';
import { registerPermissionsRoutes } from './permissionsRoutes.js';
import { registerPlaceholderUserRoutes } from './placeholderUserRoutes.js';
import { registerRolesRoutes } from './rolesRoutes.js';
import { registerUserSecurityRoutes } from './userSecurityRoutes.js';
import { registerUsersRoutes } from './usersRoutes.js';

const router = Router();

// Admin routes - require authentication and app admin status
router.use(requireAuth as RequestHandler);
router.use(requireAppAdmin as RequestHandler);
router.use(apiRateLimiter);

router.use('/backup', adminBackupRoutes);
registerMetricsRoutes(router);
registerDatabaseMaintenanceRoutes(router);
registerUserSecurityRoutes(router);
registerUsersRoutes(router);
registerConfigRoutes(router);
registerBrandingRoutes(router);
registerFontsRoutes(router);
registerPlaceholderUserRoutes(router);
registerPermissionsRoutes(router);
registerRolesRoutes(router);
registerAppAdminRoutes(router);

export { router as adminRoutes };

