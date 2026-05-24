import os from 'node:os';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import passport from 'passport';
import { User } from '../models/User.js';
import { AdminConfig } from '../models/AdminConfig.js';
import { getAdminConfig } from '../services/adminService.js';
import { toPublicLoginBranding } from '../services/loginBrandingPreview.js';
import { toPublicAppBranding } from '../services/appBrandingPreview.js';
import { hashPassword, verifyPassword, validatePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import {
  authTokenResponseField,
  clearAuthCookie,
  isProductionAuthMode,
  setAuthCookie,
} from '../utils/authCookie.js';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenExpired,
  passwordResetExpiresAt,
} from '../utils/passwordResetToken.js';
import type { RegistrationMode } from '../models/AdminConfig.js';
import { logger } from '../utils/logger.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { requireAuth, blocklistTokenFromRequest } from '../middleware/auth.js';
import { isGoogleOAuthStrategyRegistered } from '../config/passport.js';
import { claimImportPlaceholderMembershipsForUser } from '../services/importPlaceholderUserService.js';
import { attachCustomBoardThemesToPreferences } from '../services/boardThemeService.js';
import { googleOAuthLanDeviceParamsForHostHeader } from '../../shared/utils/googleOAuthPrivateIp.js';
import {
  googleOAuthAuthorizeStartUrl,
  googleOAuthRedirectToBrowserOriginIfNeeded,
} from '../../shared/utils/googleOAuthCallbackUrl.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';

const router = Router();

async function assertEmailPasswordAllowed(res: Response): Promise<boolean> {
  const cfg = await AdminConfig.findOne();
  if (!cfg?.authMethods.emailPassword) {
    res.status(403).json({
      error: {
        message: 'Email and password sign-in is disabled for this server.',
        code: 'LOCAL_AUTH_DISABLED',
        statusCode: 403,
      },
    });
    return false;
  }
  return true;
}

async function assertRegistrationAllowed(res: Response): Promise<boolean> {
  const cfg = await AdminConfig.findOne();
  const mode: RegistrationMode = cfg?.registrationMode ?? (process.env.NODE_ENV === 'production' ? 'invite-only' : 'open');
  const existingCount = await User.countDocuments({ isPlaceholder: { $ne: true } });
  if (existingCount === 0) {
    return true;
  }
  if (mode === 'disabled') {
    res.status(403).json({
      error: {
        message: 'Registration is disabled on this server.',
        code: 'REGISTRATION_DISABLED',
        statusCode: 403,
      },
    });
    return false;
  }
  if (mode === 'invite-only') {
    res.status(403).json({
      error: {
        message: 'Registration is invite-only. Contact an administrator for access.',
        code: 'REGISTRATION_INVITE_ONLY',
        statusCode: 403,
      },
    });
    return false;
  }
  return true;
}

function sendAuthSuccess(
  res: Response,
  statusCode: number,
  token: string,
  user: Record<string, unknown>,
): void {
  setAuthCookie(res, token);
  res.status(statusCode).json({
    ...authTokenResponseField(token),
    user,
  });
}

// Rate limiters
const authRateLimiter = createRateLimiter('auth');
const apiRateLimiter = createRateLimiter('api');

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(12),
  displayName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(12),
});

// Public login / registration options (no secrets)
router.get('/login-options', apiRateLimiter, async (_req, res, next) => {
  try {
    const cfg = await AdminConfig.findOne();
    if (!cfg) {
      res.json({
        defaultAuthMethod: 'email' as const,
        emailPassword: true,
        googleLogin: false,
      });
      return;
    }

    const envGoogle = !!(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    );
    const dbGoogle = !!(cfg.googleOAuth.clientId && cfg.googleOAuth.clientSecret);
    const googleConfigured = envGoogle || dbGoogle;
    const googleLogin =
      cfg.googleOAuth.enabled && cfg.authMethods.googleOAuth && googleConfigured;

    const googleOAuthStartUrl = googleOAuthAuthorizeStartUrl(
      process.env.GOOGLE_OAUTH_BROWSER_ORIGIN,
    );

    res.json({
      defaultAuthMethod: cfg.defaultAuthMethod,
      emailPassword: cfg.authMethods.emailPassword,
      googleLogin,
      ...(googleLogin && googleOAuthStartUrl !== null
        ? { googleOAuthStartUrl }
        : {}),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/login-branding', apiRateLimiter, async (_req, res, next) => {
  try {
    const cfg = await getAdminConfig();
    res.json({ branding: toPublicLoginBranding(cfg.loginScreenBranding) });
  } catch (error) {
    next(error);
  }
});

router.get('/app-branding', apiRateLimiter, async (_req, res, next) => {
  try {
    const cfg = await getAdminConfig();
    res.json({ appBranding: toPublicAppBranding(cfg.appScreenBranding) });
  } catch (error) {
    next(error);
  }
});

// Register endpoint
router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }
    if (!(await assertRegistrationAllowed(res))) {
      return;
    }

    const validated = registerSchema.parse(req.body);

    // Validate password
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

    const emailNorm = validated.email.trim().toLowerCase();
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
      existingUser.isPlaceholder = false;
      existingUser.email = emailNorm;
      existingUser.username = validated.username;
      existingUser.passwordHash = passwordHash;
      existingUser.displayName = validated.displayName;
      existingUser.emailVerified = false;
      existingUser.failedLoginAttempts = 0;
      existingUser.set('placeholderSource', undefined, { strict: false });
      existingUser.set('placeholderEmail', undefined, { strict: false });
      existingUser.set('placeholderName', undefined, { strict: false });
      existingUser.set('placeholderImportUsername', undefined, { strict: false });
      if (isFirstUser) {
        existingUser.isAppAdmin = true;
        existingUser.foundingAppAdmin = true;
      }
      await existingUser.save();
      user = existingUser;
    } else {
      const placeholderByImportEmail = await User.findOne({
        isPlaceholder: true,
        placeholderEmail: emailNorm,
      }).select('+passwordHash');
      if (placeholderByImportEmail) {
        placeholderByImportEmail.isPlaceholder = false;
        placeholderByImportEmail.email = emailNorm;
        placeholderByImportEmail.username = validated.username;
        placeholderByImportEmail.passwordHash = passwordHash;
        placeholderByImportEmail.displayName = validated.displayName;
        placeholderByImportEmail.emailVerified = false;
        placeholderByImportEmail.failedLoginAttempts = 0;
        placeholderByImportEmail.set('placeholderSource', undefined, { strict: false });
        placeholderByImportEmail.set('placeholderEmail', undefined, { strict: false });
        placeholderByImportEmail.set('placeholderName', undefined, { strict: false });
        placeholderByImportEmail.set('placeholderImportUsername', undefined, { strict: false });
        if (isFirstUser) {
          placeholderByImportEmail.isAppAdmin = true;
          placeholderByImportEmail.foundingAppAdmin = true;
        }
        await placeholderByImportEmail.save();
        user = placeholderByImportEmail;
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

    logger.info({ userId: user._id.toString(), email: user.email }, 'User registered');

    sendAuthSuccess(res, 201, token, {
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
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          errors: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

// Login endpoint
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }

    const validated = loginSchema.parse(req.body);

    // Find user
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

    // Check if account is locked
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

    // Check if user has a password (OAuth-only users)
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

    // Verify password
    const isValid = await verifyPassword(validated.password, user.passwordHash);

    if (!isValid) {
      // Increment failed login attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      // Lock account after 3 failed attempts
      if (user.failedLoginAttempts >= 3) {
        user.lockedUntil = new Date('2099-12-31'); // Permanent lock until admin unlock
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

    // Reset failed login attempts on successful login
    user.failedLoginAttempts = 0;
    user.set('lockedUntil', undefined);
    user.lastLogin = new Date();
    await user.save();

    await claimImportPlaceholderMembershipsForUser(user);

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      isAppAdmin: user.isAppAdmin,
    });

    // Log audit event
    logAuditEvent({
      userId: user._id.toString(),
      action: 'login',
      resourceType: 'user',
      resourceId: user._id.toString(),
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });

    logger.info({ userId: user._id.toString(), email: user.email }, 'User logged in');

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
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          errors: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

// Logout endpoint
router.post('/logout', apiRateLimiter, async (req, res) => {
  try {
    await blocklistTokenFromRequest(req);
  } catch (error) {
    logger.warn({ error }, 'Failed to blocklist token on logout');
  }
  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully' });
});

// Get current user endpoint
router.get('/me', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
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

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isAppAdmin: user.isAppAdmin,
        preferences: await attachCustomBoardThemesToPreferences(user._id.toString(), user.preferences),
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Forgot password endpoint
router.post('/forgot-password', authRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }

    const validated = forgotPasswordSchema.parse(req.body);

    const user = await User.findOne({ email: validated.email });

    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      res.json({ message: 'If the email exists, a password reset link has been sent' });
      return;
    }

    const resetToken = generatePasswordResetToken();
    user.passwordResetTokenHash = hashPasswordResetToken(resetToken);
    user.passwordResetTokenExpiresAt = passwordResetExpiresAt();
    user.set('verificationToken', undefined);
    await user.save();

    // TODO: Send email with reset link containing resetToken
    logger.info({ userId: user._id.toString(), email: user.email }, 'Password reset requested');

    res.json({ message: 'If the email exists, a password reset link has been sent' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          errors: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

// Reset password endpoint
router.post('/reset-password', authRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }

    const validated = resetPasswordSchema.parse(req.body);

    // Validate password
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

    const tokenHash = hashPasswordResetToken(validated.token);
    const user = await User.findOne({ passwordResetTokenHash: tokenHash }).select(
      '+passwordResetTokenHash +passwordResetTokenExpiresAt',
    );

    if (!user || isPasswordResetTokenExpired(user.passwordResetTokenExpiresAt)) {
      res.status(400).json({
        error: {
          message: 'Invalid or expired reset token',
          code: 'INVALID_TOKEN',
          statusCode: 400,
        },
      });
      return;
    }

    const passwordHash = await hashPassword(validated.password);
    user.passwordHash = passwordHash;
    user.set('passwordResetTokenHash', undefined);
    user.set('passwordResetTokenExpiresAt', undefined);
    user.set('verificationToken', undefined);
    user.set('verificationTokenExpiresAt', undefined);
    await user.save();

    logger.info({ userId: user._id.toString(), email: user.email }, 'Password reset completed');

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          errors: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

// Verify email endpoint
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

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * Base URL for redirects back to the SPA after OAuth. Prefer env in production;
 * otherwise use the incoming request so the host matches (e.g. 127.0.0.1 vs localhost).
 */
function oauthRedirectBase(req?: Request): string {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && req) {
    const host = req.get('host');
    if (host) {
      const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0]?.trim();
      return `${proto}://${host}`;
    }
  }
  const fromEnv = (process.env.APP_URL || process.env.CORS_ORIGIN)?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (req) {
    const host = req.get('host');
    if (host) {
      const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0]?.trim();
      return `${proto}://${host}`;
    }
  }
  return 'http://localhost:3000';
}

/** Open-redirect safe path for post-OAuth navigation (e.g. invite acceptance). */
function isSafeOAuthNextPath(next: string): boolean {
  if (!next.startsWith('/') || next.startsWith('//')) {
    return false;
  }
  if (next.includes('..')) {
    return false;
  }
  if (next.length > 2048) {
    return false;
  }
  if (next.startsWith('/login') || next.startsWith('/register')) {
    return false;
  }
  return true;
}

// Google OAuth (Passport session + JWT redirect for SPA)
router.get('/google', authRateLimiter, async (req, res, next) => {
  try {
    const cfg = await AdminConfig.findOne();
    const envGoogle = !!(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    );
    const dbGoogle = !!(cfg?.googleOAuth.clientId && cfg?.googleOAuth.clientSecret);
    if (!cfg?.googleOAuth.enabled || !cfg.authMethods.googleOAuth || (!envGoogle && !dbGoogle)) {
      res.status(404).json({
        error: {
          message: 'Google sign-in is not available',
          code: 'GOOGLE_AUTH_DISABLED',
          statusCode: 404,
        },
      });
      return;
    }
    if (!isGoogleOAuthStrategyRegistered()) {
      res.status(503).json({
        error: {
          message:
            'Google sign-in is not ready on the server. Check OAuth credentials and try again in a moment.',
          code: 'GOOGLE_STRATEGY_NOT_REGISTERED',
          statusCode: 503,
        },
      });
      return;
    }

    const canonicalGoogle = googleOAuthRedirectToBrowserOriginIfNeeded(
      process.env.GOOGLE_OAUTH_BROWSER_ORIGIN,
      req.get('host'),
      req.originalUrl,
    );
    if (canonicalGoogle !== null) {
      res.redirect(302, canonicalGoogle);
      return;
    }

    const nextParam = req.query.next;
    if (typeof nextParam === 'string' && nextParam.length > 0 && isSafeOAuthNextPath(nextParam)) {
      req.session.oauthReturnTo = nextParam;
    } else {
      delete req.session.oauthReturnTo;
    }

    // Ensure session (OAuth state + oauthReturnTo) is persisted before redirect to Google
    req.session.save((saveErr) => {
      if (saveErr) {
        next(saveErr);
        return;
      }
      const lanDevice = googleOAuthLanDeviceParamsForHostHeader(
        req.get('host'),
        process.env,
        () => os.hostname(),
      );
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: true,
        ...(lanDevice !== null ? lanDevice : {}),
      })(req, res, next);
    });
  } catch (error) {
    next(error);
  }
});

router.get('/google/callback', authRateLimiter, (req, res, next) => {
  const base = oauthRedirectBase(req);
  if (!isGoogleOAuthStrategyRegistered()) {
    delete req.session.oauthReturnTo;
    delete req.session.oauthPendingUserId;
    res.redirect(`${base}/login?error=google_failed`);
    return;
  }
  passport.authenticate(
    'google',
    { session: true },
    (err: Error | null, user: Express.User | false | null | undefined) => {
      if (err || !user) {
        delete req.session.oauthReturnTo;
        delete req.session.oauthPendingUserId;
        if (err) {
          logger.warn(
            { errMessage: err.message, errName: err.name },
            'Google OAuth passport authenticate failed'
          );
        } else {
          logger.warn('Google OAuth returned no user (e.g. denied or invalid state)');
        }
        const reason =
          err?.message === 'No email provided by Google'
            ? 'no_email'
            : err?.message === 'GOOGLE_EXTERNAL_MYSQL_DENIED'
              ? 'mysql_denied'
              : err?.message === 'GOOGLE_ACCOUNT_EMAIL_CONFLICT'
                ? 'email_conflict'
                : 'failed';
        res.redirect(`${base}/login?error=google_${reason}`);
        return;
      }

      const u = user as {
        id: string;
        email: string;
        username: string;
        isAppAdmin?: boolean;
      };

      delete req.session.oauthReturnTo;

      req.session.regenerate((regenErr?: Error) => {
        if (regenErr) {
          next(regenErr);
          return;
        }

        req.session.oauthPendingUserId = u.id;

        req.session.save((saveErr) => {
          if (saveErr) {
            next(saveErr);
            return;
          }

          if (isProductionAuthMode()) {
            res.redirect(`${base}/login?oauth=1`);
            return;
          }

          const token = generateToken({
            userId: u.id,
            email: u.email,
            username: u.username,
            ...(u.isAppAdmin === true ? { isAppAdmin: true as const } : {}),
          });
          setAuthCookie(res, token);
          res.redirect(`${base}/login?token=${encodeURIComponent(token)}&oauth=1`);
        });
      });
    }
  )(req, res, next);
});

router.post('/oauth/exchange', authRateLimiter, async (req, res, next) => {
  try {
    const pendingUserId = req.session.oauthPendingUserId;
    if (pendingUserId == null || pendingUserId.trim() === '') {
      res.status(400).json({
        error: {
          message: 'No pending OAuth session',
          code: 'OAUTH_EXCHANGE_MISSING',
          statusCode: 400,
        },
      });
      return;
    }

    delete req.session.oauthPendingUserId;

    const user = await User.findById(pendingUserId);
    if (!user || user.isPlaceholder === true) {
      res.status(401).json({
        error: {
          message: 'OAuth user not found',
          code: 'UNAUTHORIZED',
          statusCode: 401,
        },
      });
      return;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(403).json({
        error: {
          message: 'Account is locked',
          code: 'ACCOUNT_LOCKED',
          statusCode: 403,
        },
      });
      return;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      ...(user.isAppAdmin ? { isAppAdmin: true as const } : {}),
    });

    logAuditEvent({
      userId: user._id.toString(),
      action: 'login',
      resourceType: 'user',
      resourceId: user._id.toString(),
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
      metadata: { method: 'google-oauth' },
    });

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
    next(error);
  }
});

export { router as authRoutes };
