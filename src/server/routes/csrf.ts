import { Router } from 'express';
import { generateCSRFToken, attachCSRFToken } from '../middleware/csrf.js';

const router = Router();

/**
 * GET /api/v1/csrf/token
 * Get a CSRF token for the current session
 * This endpoint is safe (GET request) and doesn't require CSRF protection
 */
router.get('/token', attachCSRFToken, (req, res) => {
  const token = (req as { csrfToken?: string }).csrfToken || generateCSRFToken();
  
  res.json({
    csrfToken: token,
  });
});

export { router as csrfRoutes };

