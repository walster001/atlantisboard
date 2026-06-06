import { Router } from 'express';
import { attachCSRFToken } from '../middleware/csrf.js';

const router = Router();

/**
 * GET /api/v1/csrf/token
 * Issue or refresh a session-bound CSRF token (safe GET; excluded from csrfProtection).
 */
router.get('/token', attachCSRFToken, (req, res) => {
  const token = (req as { csrfToken?: string }).csrfToken;
  res.json({
    csrfToken: token ?? '',
  });
});

export { router as csrfRoutes };

