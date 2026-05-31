import { Router } from 'express';
import { emailAuthRoutes } from './emailAuth.js';
import { emailCredentialsRoutes } from './emailCredentials.js';
import { emailVerificationRoutes } from './emailVerification.js';
import { googleOAuthRoutes } from './googleOAuth.js';

const router = Router();

router.use(emailAuthRoutes);
router.use(emailCredentialsRoutes);
router.use(emailVerificationRoutes);
router.use(googleOAuthRoutes);

export { router as authRoutes };
