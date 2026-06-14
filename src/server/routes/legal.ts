import { Router } from 'express';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { getPublicPrivacyPolicyDocument } from '../services/privacyPolicyService.js';

const router = Router();

router.get('/privacy-policy', apiRateLimiter, async (_req, res, next) => {
  try {
    const document = await getPublicPrivacyPolicyDocument();
    res.json({
      version: document.version,
      markdown: document.markdown,
      html: document.html,
    });
  } catch (error) {
    next(error);
  }
});

export { router as legalRoutes };
