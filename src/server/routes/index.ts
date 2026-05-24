import { Router, type NextFunction, type Request, type Response } from 'express';
import { authRoutes } from './auth.js';
import { adminRoutes } from './admin.js';
import { workspaceRoutes } from './workspaces.js';
import { boardRoutes } from './boards.js';
import { listRoutes } from './lists.js';
import { cardRoutes } from './cards.js';
import { labelRoutes } from './labels.js';
import { checklistRoutes } from './checklists.js';
import { commentRoutes } from './comments.js';
import { importRoutes } from './import.js';
import { exportRoutes } from './export.js';
import { activityRoutes } from './activities.js';
import { inviteRoutes } from './invites.js';
import { userRoutes } from './users.js';
import { attachmentRoutes } from './attachments.js';
import { csrfRoutes } from './csrf.js';
import { brandingRoutes } from './branding.js';
import { boardBackgroundRoutes } from './boardBackgrounds.js';
import { fontRoutes } from './fonts.js';
import { importInlineRoutes } from './importInline.js';
import { themesRoutes } from './themes.js';
import { csrfProtection } from '../middleware/csrf.js';

export const apiRoutes = Router();

const CSRF_EXCLUDED_PATHS = new Set(['/auth/google', '/auth/google/callback']);

function csrfProtectionUnlessExcluded(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  if (path.startsWith('/csrf') || CSRF_EXCLUDED_PATHS.has(path)) {
    return next();
  }
  csrfProtection(req, res, next);
}

// CSRF token endpoint (must be before CSRF protection middleware, safe GET request)
apiRoutes.use('/csrf', csrfRoutes);

// Public branding assets (MinIO branding bucket)
apiRoutes.use('/branding', brandingRoutes);

// Public board background assets (MinIO backgrounds bucket)
apiRoutes.use('/board-backgrounds', boardBackgroundRoutes);

// Wekan-import inline button icons (MinIO import-inline bucket)
apiRoutes.use('/import-inline', importInlineRoutes);

// Public custom fonts (MinIO fonts bucket)
apiRoutes.use('/fonts', fontRoutes);

// Board theme catalog (system + user + board scoped)
apiRoutes.use('/themes', themesRoutes);

// CSRF protection for all state-changing requests below (OAuth + CSRF token routes excluded)
apiRoutes.use(csrfProtectionUnlessExcluded);

// Authentication routes
apiRoutes.use('/auth', authRoutes);

// Admin routes
apiRoutes.use('/admin', adminRoutes);

// Workspace routes
apiRoutes.use('/workspaces', workspaceRoutes);

// Board routes
apiRoutes.use('/boards', boardRoutes);

// List routes
apiRoutes.use('/lists', listRoutes);

// Card routes
apiRoutes.use('/cards', cardRoutes);

// User routes (includes public GET /users/avatar/:id for `<img>` — must run before any
// router mounted at `/` that applies global requireAuth, e.g. labels/attachments)
apiRoutes.use('/users', userRoutes);

// Label routes (using full paths in route definitions)
apiRoutes.use('/', labelRoutes);

// Checklist routes
apiRoutes.use('/', checklistRoutes);

// Comment routes
apiRoutes.use('/', commentRoutes);

// Import routes
apiRoutes.use('/import', importRoutes);

// Export routes
apiRoutes.use('/export', exportRoutes);

// Activity routes
apiRoutes.use('/activities', activityRoutes);

// Invite routes
apiRoutes.use('/invites', inviteRoutes);

// Attachment routes
apiRoutes.use('/', attachmentRoutes);

// Debug route — disabled in production (use /health for probes)
if (process.env.NODE_ENV !== 'production') {
  apiRoutes.get('/test', (_req, res) => {
    res.json({ message: 'API is working', timestamp: new Date().toISOString() });
  });
}
