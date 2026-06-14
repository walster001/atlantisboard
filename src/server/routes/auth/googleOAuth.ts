import os from 'node:os';
import { Router } from 'express';
import passport from 'passport';
import { User } from '../../models/User.js';
import { AdminConfig } from '../../models/AdminConfig.js';
import { generateToken } from '../../utils/jwt.js';
import {
  isProductionAuthMode,
  setAuthCookie,
} from '../../utils/authCookie.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { isGoogleOAuthStrategyRegistered } from '../../config/passport.js';
import { attachCustomBoardThemesToPreferences } from '../../services/boardThemeService.js';
import { buildAuthUserPayload } from '../../utils/authUserPayload.js';
import { googleOAuthLanDeviceParamsForHostHeader } from '../../../shared/utils/googleOAuthPrivateIp.js';
import { googleOAuthRedirectToBrowserOriginIfNeeded } from '../../../shared/utils/googleOAuthCallbackUrl.js';
import {
  authRateLimiter,
  oauthRedirectBase,
  isSafeOAuthNextPath,
  sendAuthSuccess,
} from './_helpers.js';

const router = Router();

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
            'Google OAuth passport authenticate failed',
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
                : err?.message === 'GOOGLE_MERGE_UNVERIFIED_LOCAL'
                  ? 'merge_unverified'
                  : err?.message === 'REGISTRATION_DISABLED'
                    ? 'registration_disabled'
                    : err?.message === 'REGISTRATION_INVITE_ONLY'
                      ? 'registration_invite_only'
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
    },
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

    sendAuthSuccess(res, 200, token, buildAuthUserPayload(
      user,
      await attachCustomBoardThemesToPreferences(user._id.toString(), user.preferences),
    ));
  } catch (error) {
    next(error);
  }
});

export { router as googleOAuthRoutes };
