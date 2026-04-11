import { Router } from 'express';
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
import { fontRoutes } from './fonts.js';

export const apiRoutes = Router();

// CSRF token endpoint (must be before CSRF protection middleware, safe GET request)
apiRoutes.use('/csrf', csrfRoutes);

// Public branding assets (MinIO branding bucket)
apiRoutes.use('/branding', brandingRoutes);

// Public custom fonts (MinIO fonts bucket)
apiRoutes.use('/fonts', fontRoutes);

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

// Test route
apiRoutes.get('/test', (_req, res) => {
  res.json({ message: 'API is working', timestamp: new Date().toISOString() });
});


