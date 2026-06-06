import { Router, type RequestHandler } from 'express';
import { User } from '../../models/User.js';
import { AdminConfig } from '../../models/AdminConfig.js';
import { getAdminConfig } from '../../services/adminService.js';
import { toPublicLoginBranding } from '../../services/loginBrandingPreview.js';
import { toPublicAppBranding } from '../../services/appBrandingPreview.js';
import { hashPassword, validatePassword } from '../../utils/password.js';
import { jwtExpiresInSeconds } from '../../utils/jwt.js';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenExpired,
  passwordResetExpiresAt,
} from '../../utils/passwordResetToken.js';
import { logger } from '../../utils/logger.js';
import { sendPasswordResetEmail } from '../../services/emailService.js';
import { requireAuth, blocklistTokenFromRequest } from '../../middleware/auth.js';
import { revokeAllTokensForUser } from '../../utils/jwtBlocklist.js';
import {
  isNewUserRegistrationOpen,
  resolveRegistrationMode,
} from '../../utils/registrationPolicy.js';
import { attachCustomBoardThemesToPreferences } from '../../services/boardThemeService.js';
import { googleOAuthAuthorizeStartUrl } from '../../../shared/utils/googleOAuthCallbackUrl.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { clearAuthCookie } from '../../utils/authCookie.js';
import {
  apiRateLimiter,
  authRateLimiter,
  assertEmailPasswordAllowed,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './_helpers.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { parseOrThrow } from '../../utils/zodValidation.js';

const router = Router();

router.get('/login-options', apiRateLimiter, async (_req, res, next) => {
  try {
    const cfg = await AdminConfig.findOne();
    if (!cfg) {
      res.json({
        defaultAuthMethod: 'email' as const,
        emailPassword: true,
        googleLogin: false,
        registrationMode: 'open' as const,
        registrationOpen: true,
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

    const registrationMode = resolveRegistrationMode(cfg.registrationMode);
    const registrationOpen = await isNewUserRegistrationOpen();

    res.json({
      defaultAuthMethod: cfg.defaultAuthMethod,
      emailPassword: cfg.authMethods.emailPassword,
      googleLogin,
      registrationMode,
      registrationOpen,
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

router.post('/logout', apiRateLimiter, async (req, res) => {
  try {
    await blocklistTokenFromRequest(req);
  } catch (error) {
    logger.warn({ error }, 'Failed to blocklist token on logout');
  }
  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully' });
});

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

router.post('/forgot-password', authRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }

    const validated = parseOrThrow(forgotPasswordSchema, req.body);

    const user = await User.findOne({ email: validated.email });

    if (!user) {
      res.json({ message: 'If the email exists, a password reset link has been sent' });
      return;
    }

    const resetToken = generatePasswordResetToken();
    user.passwordResetTokenHash = hashPasswordResetToken(resetToken);
    user.passwordResetTokenExpiresAt = passwordResetExpiresAt();
    user.set('verificationToken', undefined);
    await user.save();

    void sendPasswordResetEmail(user.email, resetToken);
    logger.info({ userId: user._id.toString(), email: user.email }, 'Password reset requested');

    res.json({ message: 'If the email exists, a password reset link has been sent' });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

router.post('/reset-password', authRateLimiter, async (req, res, next) => {
  try {
    if (!(await assertEmailPasswordAllowed(res))) {
      return;
    }

    const validated = parseOrThrow(resetPasswordSchema, req.body);

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
    await revokeAllTokensForUser(user._id.toString(), jwtExpiresInSeconds());

    logger.info({ userId: user._id.toString(), email: user.email }, 'Password reset completed');

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

export { router as emailAuthRoutes };
