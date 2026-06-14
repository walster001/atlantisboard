import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { User } from '../../models/User.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { attachCustomBoardThemesToPreferences } from '../../services/boardThemeService.js';
import { buildAuthUserPayload } from '../../utils/authUserPayload.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { PRIVACY_POLICY_VERSION } from '../../../shared/legal/privacyPolicy.js';
import { logAuditEvent } from '../../utils/auditLogger.js';

const router = Router();

const acceptPrivacyPolicySchema = z.object({
  version: z.literal(PRIVACY_POLICY_VERSION),
});

router.post(
  '/me/privacy-policy-acceptance',
  apiRateLimiter,
  requireAuth as RequestHandler,
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = parseOrThrow(acceptPrivacyPolicySchema, req.body);

      const user = await User.findById(authReq.user.id);
      if (!user) {
        res.status(404).json({
          error: {
            message: 'User not found',
            code: 'USER_NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      user.privacyPolicyAcceptedVersion = validated.version;
      user.privacyPolicyAcceptedAt = new Date();
      await user.save();

      logAuditEvent({
        userId: user._id.toString(),
        action: 'privacy_policy_accepted',
        resourceType: 'user',
        resourceId: user._id.toString(),
        ipAddress: req.ip || undefined,
        timestamp: new Date(),
        metadata: { version: validated.version },
      });

      const preferences = await attachCustomBoardThemesToPreferences(
        user._id.toString(),
        user.preferences,
      );

      res.json({
        user: buildAuthUserPayload(user, preferences),
      });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  },
);

export { router as userPrivacyPolicyAcceptanceRoutes };
