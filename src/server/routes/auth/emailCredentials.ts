import crypto from 'node:crypto';
import { Router } from 'express';
import { User } from '../../models/User.js';
import { AdminConfig } from '../../models/AdminConfig.js';
import { hashPassword, verifyPassword, validatePassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { logger } from '../../utils/logger.js';
import { sendVerificationEmail } from '../../services/emailService.js';
import { loginIpRateLimiter } from '../../middleware/rateLimit.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { claimImportPlaceholderMembershipsForUser } from '../../services/importPlaceholderUserService.js';
import { claimPlaceholderAsRealUser } from '../../services/claimPlaceholderUserService.js';
import { attachCustomBoardThemesToPreferences } from '../../services/boardThemeService.js';
import { issueCSRFToken } from '../../middleware/csrf.js';
import {
  authRateLimiter,
  assertEmailPasswordAllowed,
  assertRegistrationAllowed,
  loginSchema,
  registerSchema,
  sendAuthSuccess,
} from './_helpers.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { parseOrThrow } from '../../utils/zodValidation.js';

const router = Router();

router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }

    const validated = parseOrThrow(registerSchema, req.body);

    const emailNorm = validated.email.trim().toLowerCase();
    if (
      !(await assertRegistrationAllowed(res, {
        email: emailNorm,
        username: validated.username,
      }))
    ) {
      return;
    }

    const passwordValidation = validatePassword(validated.password);
    if (!passwordValidation.valid) {
      res.status(400).json({
        error: {
          message: 'Password validation failed',
          code: 'PASSWORD_VALIDATION_FAILED',
          statusCode: 400,
          errors: passwordValidation.errors,
        },
      });
      return;
    }

    const existingUser = await User.findOne({
      $or: [{ email: emailNorm }, { username: validated.username }],
    }).select('+passwordHash');

    if (existingUser && existingUser.isPlaceholder !== true) {
      res.status(409).json({
        error: {
          message: 'User already exists',
          code: 'USER_EXISTS',
          statusCode: 409,
        },
      });
      return;
    }

    const passwordHash = await hashPassword(validated.password);
    const existingCount = await User.countDocuments({ isPlaceholder: { $ne: true } });
    const isFirstUser = existingCount === 0;

    let user = existingUser;
    if (existingUser?.isPlaceholder === true) {
      const placeholderMatch =
        existingUser.placeholderEmail?.toLowerCase() === emailNorm ||
        existingUser.email.toLowerCase() === emailNorm;
      if (!placeholderMatch) {
        res.status(409).json({
          error: {
            message: 'User already exists',
            code: 'USER_EXISTS',
            statusCode: 409,
          },
        });
        return;
      }
      user = await claimPlaceholderAsRealUser(existingUser, {
        emailNorm,
        username: validated.username,
        passwordHash,
        displayName: validated.displayName,
        isFirstUser,
      });
    } else {
      const placeholderByImportEmail = await User.findOne({
        isPlaceholder: true,
        placeholderEmail: emailNorm,
      }).select('+passwordHash');
      if (placeholderByImportEmail) {
        user = await claimPlaceholderAsRealUser(placeholderByImportEmail, {
          emailNorm,
          username: validated.username,
          passwordHash,
          displayName: validated.displayName,
          isFirstUser,
        });
      } else {
        user = new User({
          email: emailNorm,
          username: validated.username,
          passwordHash,
          displayName: validated.displayName,
          emailVerified: false,
          failedLoginAttempts: 0,
          isAppAdmin: isFirstUser,
          foundingAppAdmin: isFirstUser,
        });
        await user.save();
      }
    }

    await claimImportPlaceholderMembershipsForUser(user);

    const adminCfg = await AdminConfig.findOne();
    const verificationRequired = isFirstUser
      ? false
      : adminCfg?.requireEmailVerification !== false;

    if (!verificationRequired) {
      user.emailVerified = true;
      await user.save();

      const token = generateToken({
        userId: user._id.toString(),
        email: user.email,
        username: user.username,
        isAppAdmin: user.isAppAdmin,
      });

      logAuditEvent({
        userId: user._id.toString(),
        action: 'register',
        resourceType: 'user',
        resourceId: user._id.toString(),
        ipAddress: req.ip || undefined,
        timestamp: new Date(),
      });

      logger.info({ userId: user._id.toString(), email: user.email }, 'User registered (verification not required)');

      sendAuthSuccess(res, 201, token, {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isAppAdmin: user.isAppAdmin,
        preferences: await attachCustomBoardThemesToPreferences(user._id.toString(), user.preferences),
        emailVerified: true,
      });
      return;
    }

    const verificationToken = crypto.randomBytes(32).toString('base64url');
    user.verificationToken = verificationToken;
    user.verificationTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    void sendVerificationEmail(user.email, verificationToken, user.displayName);

    logAuditEvent({
      userId: user._id.toString(),
      action: 'register',
      resourceType: 'user',
      resourceId: user._id.toString(),
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });

    logger.info({ userId: user._id.toString(), email: user.email }, 'User registered — verification email sent');

    res.status(202).json({
      verificationRequired: true,
      message: 'Account created. Please check your email to verify your address before signing in.',
    });
  } catch (error) {
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    ) {
      res.status(409).json({
        error: {
          message: 'User already exists',
          code: 'USER_EXISTS',
          statusCode: 409,
        },
      });
      return;
    }
    handleApiRouteError(res, error, next);
  }
});

router.post('/login', authRateLimiter, loginIpRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }

    const validated = parseOrThrow(loginSchema, req.body);

    const user = await User.findOne({ email: validated.email }).select('+passwordHash +failedLoginAttempts +lockedUntil');

    if (!user) {
      res.status(401).json({
        error: {
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
          statusCode: 401,
        },
      });
      return;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(403).json({
        error: {
          message: 'Account is locked. Please contact an administrator.',
          code: 'ACCOUNT_LOCKED',
          statusCode: 403,
        },
      });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({
        error: {
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
          statusCode: 401,
        },
      });
      return;
    }

    const isValid = await verifyPassword(validated.password, user.passwordHash);

    if (!isValid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= 3) {
        user.lockedUntil = new Date('2099-12-31');
        logger.warn({ userId: user._id.toString(), email: user.email }, 'Account locked due to failed login attempts');
      }

      await user.save();

      res.status(401).json({
        error: {
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
          statusCode: 401,
        },
      });
      return;
    }

    if (user.isPlaceholder === true) {
      res.status(401).json({
        error: {
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
          statusCode: 401,
        },
      });
      return;
    }

    if (!user.emailVerified) {
      const cfg = await AdminConfig.findOne();
      if (cfg?.requireEmailVerification !== false) {
        res.status(403).json({
          error: {
            message: 'Please verify your email address before signing in. Check your inbox for a verification link.',
            code: 'EMAIL_NOT_VERIFIED',
            statusCode: 403,
          },
        });
        return;
      }
    }

    user.failedLoginAttempts = 0;
    user.set('lockedUntil', undefined);
    user.lastLogin = new Date();
    await user.save();

    await claimImportPlaceholderMembershipsForUser(user);

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((regenErr?: Error) => {
        if (regenErr) {
          reject(regenErr);
          return;
        }
        resolve();
      });
    });

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      isAppAdmin: user.isAppAdmin,
    });

    logAuditEvent({
      userId: user._id.toString(),
      action: 'login',
      resourceType: 'user',
      resourceId: user._id.toString(),
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });

    logger.info({ userId: user._id.toString(), email: user.email }, 'User logged in');

    issueCSRFToken(req, res);

    sendAuthSuccess(res, 200, token, {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      profilePicture: user.profilePicture,
      isAppAdmin: user.isAppAdmin,
      preferences: await attachCustomBoardThemesToPreferences(user._id.toString(), user.preferences),
      emailVerified: user.emailVerified,
    });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

export { router as emailCredentialsRoutes };
