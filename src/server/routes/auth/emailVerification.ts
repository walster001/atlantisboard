import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { User } from '../../models/User.js';
import { generateToken } from '../../utils/jwt.js';
import { logger } from '../../utils/logger.js';
import { sendVerificationEmail } from '../../services/emailService.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { attachCustomBoardThemesToPreferences } from '../../services/boardThemeService.js';
import { authRateLimiter, sendAuthSuccess } from './_helpers.js';

const router = Router();

router.get('/verify-email', authRateLimiter, async (req, res, next) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).json({
        error: {
          message: 'Verification token is required',
          code: 'TOKEN_REQUIRED',
          statusCode: 400,
        },
      });
      return;
    }

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

    sendAuthSuccess(res, 200, jwt, {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      profilePicture: user.profilePicture,
      isAppAdmin: user.isAppAdmin,
      preferences: await attachCustomBoardThemesToPreferences(user._id.toString(), user.preferences),
      emailVerified: true,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/resend-verification', authRateLimiter, async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);
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
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Valid email address is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    next(error);
  }
});

export { router as emailVerificationRoutes };
