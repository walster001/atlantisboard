import { Router } from 'express';
import { userAvatarRoutes } from './avatar.js';
import { userProfileRoutes } from './profile.js';
import { userPushRoutes } from './push.js';

const router = Router();

router.use(userAvatarRoutes);
router.use(userProfileRoutes);
router.use(userPushRoutes);

export { router as userRoutes };
