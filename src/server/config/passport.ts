import passport from 'passport';
import { GoogleStrategyWithLanDeviceParams } from './GoogleStrategyWithLanDeviceParams.js';
import { User } from '../models/User.js';
import { AdminConfig } from '../models/AdminConfig.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import {
  normalizeGoogleOAuthCallbackUrl,
  resolveGoogleOAuthPassportCallbackUrl,
  resolveGoogleOAuthRuntimeSettings,
  setGoogleOAuthAdminForceHttpsUpgrade,
} from '../../shared/utils/googleOAuthCallbackUrl.js';
import { deriveUniqueUsernameForGoogleOAuth } from '../utils/googleOAuthUsername.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { claimImportPlaceholderMembershipsForUser } from '../services/importPlaceholderUserService.js';
import { verifyUserInMySQL } from '../services/mysqlService.js';
import { assertNewUserRegistrationAllowed } from '../utils/registrationPolicy.js';
import { hasPassportStrategy, type PassportWithStrategyRegistry } from '../types/passportRegistry.js';

// Serialize user for session
passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: string }).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

function unregisterGoogleStrategy(): void {
  try {
    passport.unuse('google');
  } catch {
    /* no prior strategy */
  }
}

/** True when Passport has a registered Google OAuth strategy (for route guards). */
export function isGoogleOAuthStrategyRegistered(): boolean {
  return hasPassportStrategy(passport as PassportWithStrategyRegistry, 'google');
}

// Google OAuth Strategy — call after DB is ready and after admin config changes affecting OAuth.
export async function configureGoogleStrategy(): Promise<void> {
  unregisterGoogleStrategy();

  try {
    const config = await AdminConfig.findOne();
    if (!config || !config.googleOAuth.enabled) {
      setGoogleOAuthAdminForceHttpsUpgrade(undefined);
      logger.info('Google OAuth is not enabled');
      return;
    }

    const envClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const envClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

    let clientId = envClientId || config.googleOAuth.clientId;
    let clientSecret = envClientSecret || config.googleOAuth.clientSecret;

    if (!clientId || !clientSecret) {
      logger.warn('Google OAuth is enabled but credentials are missing (set .env or admin config)');
      return;
    }

    if (!envClientId) {
      try {
        clientId = await decrypt(clientId);
      } catch {
        /* stored plaintext */
      }
    }
    if (!envClientSecret) {
      try {
        clientSecret = await decrypt(clientSecret);
      } catch {
        /* stored plaintext */
      }
    }

    const envCallbackUrl = process.env.GOOGLE_CALLBACK_URL?.trim();
    const storedCallbackUrl = config.googleOAuth.callbackUrl?.trim();
    const rawCallback =
      envCallbackUrl || storedCallbackUrl || '/api/v1/auth/google/callback';
    const normalizedCallback =
      normalizeGoogleOAuthCallbackUrl(rawCallback) || '/api/v1/auth/google/callback';
    setGoogleOAuthAdminForceHttpsUpgrade(config.googleOAuth.forceHttpsUpgrade === true);
    const oauthRuntime = resolveGoogleOAuthRuntimeSettings({
      FORCE_HTTPS: process.env.FORCE_HTTPS,
      OAUTH_REDIRECT_BASE: process.env.OAUTH_REDIRECT_BASE,
      APP_URL: process.env.APP_URL,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
    });
    const callbackURL = resolveGoogleOAuthPassportCallbackUrl({
      normalizedCallback,
      nodeEnv: process.env.NODE_ENV,
      googleOAuthBrowserOrigin: process.env.GOOGLE_OAUTH_BROWSER_ORIGIN,
      forceHttps: oauthRuntime.forceHttps,
      publicBaseUrl: oauthRuntime.publicBaseUrl,
    });

    passport.use(
      'google',
      new GoogleStrategyWithLanDeviceParams(
        {
          clientID: clientId,
          clientSecret: clientSecret,
          callbackURL,
          proxy: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value?.toLowerCase();
            if (!email) {
              return done(new Error('No email provided by Google'), false);
            }

            const adminCfg = await AdminConfig.findOne();
            if (
              adminCfg?.authMethods.googleOAuthExternalMySQL &&
              adminCfg.externalMySQL.enabled
            ) {
              const allowed = await verifyUserInMySQL(email);
              if (!allowed) {
                logger.warn({ email }, 'Google login denied: external database verification failed');
                return done(new Error('GOOGLE_EXTERNAL_MYSQL_DENIED'), false);
              }
            }

            // Include passwordHash so save() does not strip it (field has select: false).
            let user = await User.findOne({ googleId: profile.id }).select('+passwordHash');

            if (!user) {
              // Same email as a local (or prior) account → merge into one user (Google + password).
              const existingUser = await User.findOne({ email }).select('+passwordHash');

              if (existingUser) {
                // Check if it's a placeholder user
                if (existingUser.isPlaceholder) {
                  // Check if this is the first user (before converting)
                  const userCount = await User.countDocuments({ isPlaceholder: false });
                  const isFirstUser = userCount === 0;

                  // Convert placeholder user to real user
                  existingUser.isPlaceholder = false;
                  existingUser.googleId = profile.id;
                  existingUser.emailVerified = !!profile.emails?.[0]?.verified;
                  existingUser.displayName = profile.displayName || existingUser.placeholderName || email.split('@')[0] || 'User';
                  if (profile.photos?.[0]?.value) {
                    existingUser.googleProfilePicture = profile.photos[0].value;
                    existingUser.profilePicture = profile.photos[0].value;
                  }
                  if (isFirstUser) {
                    existingUser.isAppAdmin = true;
                    existingUser.foundingAppAdmin = true;
                  }
                  // Clean up placeholder fields
                  delete existingUser.placeholderSource;
                  delete existingUser.placeholderEmail;
                  delete existingUser.placeholderName;
                  delete existingUser.placeholderImportUsername;
                  await existingUser.save();
                  await claimImportPlaceholderMembershipsForUser(existingUser);
                  if (isFirstUser) {
                    logger.info({ userId: existingUser._id.toString() }, 'First user (from placeholder) automatically made app admin via OAuth');
                  } else {
                    logger.info({ userId: existingUser._id.toString() }, 'Placeholder user converted to real user via OAuth');
                  }
                  user = existingUser;
                } else {
                  if (
                    existingUser.googleId &&
                    existingUser.googleId !== profile.id
                  ) {
                    logger.warn(
                      { email, existingGoogleId: existingUser.googleId },
                      'Google login rejected: email already linked to a different Google account'
                    );
                    return done(new Error('GOOGLE_ACCOUNT_EMAIL_CONFLICT'), false);
                  }

                  if (!existingUser.googleId && !existingUser.emailVerified) {
                    logger.warn(
                      { email },
                      'Google login rejected: local account with same email has not verified email ownership',
                    );
                    return done(new Error('GOOGLE_MERGE_UNVERIFIED_LOCAL'), false);
                  }

                  existingUser.googleId = profile.id;
                  const googleVerified = !!profile.emails?.[0]?.verified;
                  existingUser.emailVerified =
                    Boolean(existingUser.emailVerified) || googleVerified;
                  existingUser.lastLogin = new Date();

                  const googlePhoto = profile.photos?.[0]?.value;
                  if (googlePhoto) {
                    existingUser.googleProfilePicture = googlePhoto;
                    if (!existingUser.profilePicture?.trim()) {
                      existingUser.profilePicture = googlePhoto;
                    }
                  }

                  const googleName = profile.displayName?.trim();
                  if (googleName && !existingUser.displayName?.trim()) {
                    existingUser.displayName = googleName;
                  }

                  await existingUser.save();
                  await claimImportPlaceholderMembershipsForUser(existingUser);
                  logAuditEvent({
                    userId: existingUser._id.toString(),
                    action: 'user.google_merged',
                    resourceType: 'user',
                    resourceId: existingUser._id.toString(),
                    timestamp: new Date(),
                  });
                  logger.info(
                    { userId: existingUser._id.toString(), email },
                    'Google account linked to existing local user (same email)'
                  );
                  user = existingUser;
                }
              } else {
                const registration = await assertNewUserRegistrationAllowed({ email });
                if (!registration.allowed) {
                  logger.warn(
                    { email, mode: registration.mode, reason: registration.reason },
                    'Google sign-up denied by registration policy',
                  );
                  return done(new Error(registration.reason), false);
                }

                // Check if this is the first user (before creating)
                const userCount = await User.countDocuments();
                const isFirstUser = userCount === 0;

                // Create new user (username must satisfy schema min length 3; email local part may not)
                const username = await deriveUniqueUsernameForGoogleOAuth(email, profile.id);
                user = new User({
                  email,
                  username,
                  googleId: profile.id,
                  googleProfilePicture: profile.photos?.[0]?.value,
                  displayName: profile.displayName || email.split('@')[0] || 'User',
                  profilePicture: profile.photos?.[0]?.value,
                  emailVerified: !!profile.emails?.[0]?.verified,
                  isAppAdmin: isFirstUser,
                  foundingAppAdmin: isFirstUser,
                  preferences: {
                    theme: 'light',
                    notifications: true,
                    language: 'en',
                    notificationPreferences: {
                      reminders: { inApp: true, push: true, sms: false },
                      assignments: { inApp: true, push: true },
                      comments: { inApp: true, push: true },
                      mentions: { inApp: true, push: true },
                      invites: { inApp: true, push: true },
                    },
                  },
                });
                await user.save();
                await claimImportPlaceholderMembershipsForUser(user);
                if (isFirstUser) {
                  logger.info({ userId: user._id.toString() }, 'First user automatically made app admin via Google OAuth');
                } else {
                  logger.info({ userId: user._id.toString() }, 'User created via Google OAuth');
                }
              }
            } else {
              const googleVerified = !!profile.emails?.[0]?.verified;
              user.emailVerified = Boolean(user.emailVerified) || googleVerified;
              // Update profile picture and name if changed
              if (profile.photos?.[0]?.value) {
                user.googleProfilePicture = profile.photos[0].value;
                if (
                  !user.profilePicture?.includes('/users/avatar/') &&
                  user.profilePicture !== profile.photos[0].value
                ) {
                  user.profilePicture = profile.photos[0].value;
                }
              }
              if (profile.displayName && user.displayName !== profile.displayName) {
                user.displayName = profile.displayName;
              }
              user.lastLogin = new Date();
              await user.save({ validateBeforeSave: false });
              await claimImportPlaceholderMembershipsForUser(user);
            }

            if (!user) {
              return done(new Error('Failed to create or find user'), false);
            }

            return done(null, { 
              id: user._id.toString(), 
              email: user.email, 
              username: user.username,
              isAppAdmin: user.isAppAdmin || false,
            });
          } catch (error) {
            logger.error({ error }, 'Error in Google OAuth strategy');
            return done(error, false);
          }
        }
      )
    );

    logger.info('Google OAuth strategy configured');
  } catch (error) {
    logger.error({ error }, 'Error configuring Google OAuth strategy');
  }
}

export { passport };

