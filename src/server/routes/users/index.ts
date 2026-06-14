import { Router } from 'express';
import { userAvatarRoutes } from './avatar.js';
import { userPrivacyPolicyAcceptanceRoutes } from './privacyPolicyAcceptance.js';
import { userProfileRoutes } from './profile.js';
import { userPushRoutes } from './push.js';

const router = Router();

router.use(userAvatarRoutes);
router.use(userPrivacyPolicyAcceptanceRoutes);
router.use(userProfileRoutes);
router.use(userPushRoutes);

export { router as userRoutes };
