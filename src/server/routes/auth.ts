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
import { logger } from '../utils/logger.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { requireAuth } from '../middleware/auth.js';
import { isGoogleOAuthStrategyRegistered } from '../config/passport.js';
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

    res.json({
      defaultAuthMethod: cfg.defaultAuthMethod,
      emailPassword: cfg.authMethods.emailPassword,
      googleLogin,
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

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: validated.email }, { username: validated.username }],
    });

    if (existingUser) {
      res.status(409).json({
        error: {
          message: 'User already exists',
          code: 'USER_EXISTS',
          statusCode: 409,
        },
      });
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(validated.password);

    const existingCount = await User.countDocuments();
    const isFirstUser = existingCount === 0;

    // Create user (first registered account becomes bootstrap App Admin)
    const user = new User({
      email: validated.email,
      username: validated.username,
      passwordHash,
      displayName: validated.displayName,
      emailVerified: false,
      failedLoginAttempts: 0,
      isAppAdmin: isFirstUser,
      foundingAppAdmin: isFirstUser,
    });

    await user.save();

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
      action: 'register',
      resourceType: 'user',
      resourceId: user._id.toString(),
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });

    logger.info({ userId: user._id.toString(), email: user.email }, 'User registered');

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isAppAdmin: user.isAppAdmin,
        preferences: user.preferences,
        emailVerified: user.emailVerified,
      },
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

    // Reset failed login attempts on successful login
    user.failedLoginAttempts = 0;
    user.set('lockedUntil', undefined);
    user.lastLogin = new Date();
    await user.save();

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

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isAppAdmin: user.isAppAdmin,
        preferences: user.preferences,
        emailVerified: user.emailVerified,
      },
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
router.post('/logout', apiRateLimiter, async (_req, res) => {
  // For JWT-based auth, logout is handled client-side by removing the token
  // This endpoint exists for consistency and potential future session-based auth
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
        preferences: user.preferences,
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

    // Generate reset token (simplified - in production, use crypto.randomBytes and store with expiry)
    const resetToken = crypto.randomUUID();
    user.verificationToken = resetToken;
    await user.save();

    // TODO: Send email with reset link
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

    const user = await User.findOne({ verificationToken: validated.token });

    if (!user) {
      res.status(400).json({
        error: {
          message: 'Invalid or expired reset token',
          code: 'INVALID_TOKEN',
          statusCode: 400,
        },
      });
      return;
    }

    // Hash new password
    const passwordHash = await hashPassword(validated.password);
    user.passwordHash = passwordHash;
    user.set('verificationToken', undefined);
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

    if (!user) {
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
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: true,
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
    res.redirect(`${base}/login?error=google_failed`);
    return;
  }
  passport.authenticate(
    'google',
    { session: true },
    (err: Error | null, user: Express.User | false | null | undefined) => {
      if (err || !user) {
        delete req.session.oauthReturnTo;
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
      const token = generateToken({
        userId: u.id,
        email: u.email,
        username: u.username,
        ...(u.isAppAdmin === true ? { isAppAdmin: true as const } : {}),
      });
      delete req.session.oauthReturnTo;
      /* Post-login path: client uses sessionStorage (see postLoginRedirect); omit `next` from URL */
      res.redirect(`${base}/login?token=${encodeURIComponent(token)}&oauth=1`);
    }
  )(req, res, next);
});

export { router as authRoutes };
