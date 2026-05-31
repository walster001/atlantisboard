import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { User } from '../../models/User.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../types/express.js';
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
    const validated = pushSubscriptionSchema.parse(req.body);
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
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    next(error);
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
