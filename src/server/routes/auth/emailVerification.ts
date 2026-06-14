import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { User } from '../../models/User.js';
import { generateToken } from '../../utils/jwt.js';
import { logger } from '../../utils/logger.js';
import { sendVerificationEmail } from '../../services/emailService.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { attachCustomBoardThemesToPreferences } from '../../services/boardThemeService.js';
import { buildAuthUserPayload } from '../../utils/authUserPayload.js';
import { authRateLimiter, sendAuthSuccess, verifyEmailSchema } from './_helpers.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { parseOrThrow } from '../../utils/zodValidation.js';

const router = Router();

/** Deprecated: email clients may prefetch GET links. Use POST /auth/verify-email instead. */
router.get('/verify-email', authRateLimiter, (_req, res) => {
  res.status(405).json({
    error: {
      message: 'Email verification must be submitted via POST /auth/verify-email',
      code: 'METHOD_NOT_ALLOWED',
      statusCode: 405,
    },
  });
});

router.post('/verify-email', authRateLimiter, async (req, res, next) => {
  try {
    const { token } = parseOrThrow(verifyEmailSchema, req.body);

    const user = await User.findOne({ verificationToken: token });

    if (!user || (user.verificationTokenExpiresAt != null && user.verificationTokenExpiresAt < new Date())) {
      res.status(400).json({
        error: {
          message: 'Invalid or expired verification token',
          code: 'INVALID_TOKEN',
          statusCode: 400,
        },
      });
      return;
    }

    user.emailVerified = true;
    user.set('verificationToken', undefined);
    user.set('verificationTokenExpiresAt', undefined);
    await user.save();

    logger.info({ userId: user._id.toString(), email: user.email }, 'Email verified');

    logAuditEvent({
      userId: user._id.toString(),
      action: 'email_verified',
      resourceType: 'user',
      resourceId: user._id.toString(),
      timestamp: new Date(),
    });

    const jwt = generateToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      isAppAdmin: user.isAppAdmin,
    });

    sendAuthSuccess(res, 200, jwt, buildAuthUserPayload(
      user,
      await attachCustomBoardThemesToPreferences(user._id.toString(), user.preferences),
    ));
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

router.post('/resend-verification', authRateLimiter, async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const { email } = parseOrThrow(schema, req.body);
    const emailNorm = email.toLowerCase().trim();

    const user = await User.findOne({ email: emailNorm });

    if (!user || user.emailVerified || user.isPlaceholder) {
      res.json({ message: 'If that email is registered and unverified, a new verification link has been sent.' });
      return;
    }

    const verificationToken = crypto.randomBytes(32).toString('base64url');
    user.verificationToken = verificationToken;
    user.verificationTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    void sendVerificationEmail(user.email, verificationToken, user.displayName);

    logger.info({ userId: user._id.toString(), email: user.email }, 'Verification email resent');

    res.json({ message: 'If that email is registered and unverified, a new verification link has been sent.' });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

export { router as emailVerificationRoutes };
