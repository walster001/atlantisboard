import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError, UnauthorizedError } from '../middleware/errorHandler.js';
import { prisma } from '../db/client.js';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../config/env.js';

const router = Router();

// Sign up
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.signUp(req.body);
    res.status(201).json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// Sign in
router.post('/signin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.signIn(req.body);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    const result = await authService.refreshToken(refreshToken);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const user = await prisma.user.findUnique({
      where: { id: authReq.userId },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.profile?.fullName ?? null,
      isAdmin: user.profile?.isAdmin ?? false,
      avatarUrl: user.profile?.avatarUrl ?? null,
      provider: user.provider || 'email', // Include provider for OAuth detection
    });
  } catch (error: unknown) {
    next(error);
  }
});

// Sign out
router.post('/signout', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await authService.signOut(refreshToken);
    }
    
    res.json({ success: true });
  } catch (error: unknown) {
    next(error);
  }
});

// Verify email (for Google OAuth with MySQL verification)
router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      throw new ValidationError('Email is required');
    }

    const result = await authService.verifyEmailForGoogleAuth(email);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// Google OAuth setup
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL || 'http://127.0.0.1:3000/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const result = await authService.findOrCreateGoogleUser(
            profile.id,
            profile.emails?.[0]?.value || '',
            profile.displayName,
            profile.photos?.[0]?.value
          );
          done(null, result);
        } catch (error: unknown) {
          done(error, false);
        }
      }
    )
  );

  // Google OAuth initiation
  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account',
    })
  );

  // Google OAuth callback
  router.get(
    '/google/callback',
    passport.authenticate('google', { session: false }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = req.user as {
          user: { id: string; email: string; fullName: string | null; isAdmin: boolean };
          accessToken: string;
          refreshToken: string;
        };

        // Redirect to frontend with tokens in URL hash (for security)
        const redirectUrl = new URL(env.CORS_ORIGIN);
        redirectUrl.hash = `access_token=${result.accessToken}&refresh_token=${result.refreshToken}`;
        
        res.redirect(redirectUrl.toString());
      } catch (error: unknown) {
        next(error);
      }
    }
  );
} else {
  // Google OAuth not configured - return helpful error
  router.get('/google', (_req: Request, res: Response) => {
    res.status(503).json({
      error: 'Google OAuth is not configured',
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables',
    });
  });

  router.get('/google/callback', (_req: Request, res: Response) => {
    res.status(503).json({
      error: 'Google OAuth is not configured',
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables',
    });
  });
}

export default router;

