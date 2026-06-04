import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { User } from '../../models/User.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { getVapidPublicKey } from '../../config/vapid.js';

const router = Router();

const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

router.get('/vapid-public-key', apiRateLimiter, async (_req, res, next) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ publicKey });
  } catch (error) {
    next(error);
  }
});

router.post('/me/push-subscription', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = parseOrThrow(pushSubscriptionSchema, req.body);
    const user = await User.findById(authReq.user.id).select('+pushSubscription');
    if (!user) {
      res.status(404).json({
        error: { message: 'User not found', code: 'NOT_FOUND', statusCode: 404 },
      });
      return;
    }
    user.pushSubscription = validated.subscription;
    await user.save();
    res.json({ message: 'Push subscription registered successfully' });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

router.delete('/me/push-subscription', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await User.findById(authReq.user.id).select('+pushSubscription');
    if (!user) {
      res.status(404).json({
        error: { message: 'User not found', code: 'NOT_FOUND', statusCode: 404 },
      });
      return;
    }
    await User.updateOne({ _id: authReq.user.id }, { $unset: { pushSubscription: 1 } });
    res.json({ message: 'Push subscription removed successfully' });
  } catch (error) {
    next(error);
  }
});

export { router as userPushRoutes };
