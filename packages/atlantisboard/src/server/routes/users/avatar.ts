import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { User } from '../../models/User.js';
import { requireAuth, requireSignedAssetOrAuth } from '../../middleware/auth.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import {
  deleteUserAvatar,
  getUserAvatarObject,
  inferAvatarMimeFromBuffer,
  isAllowedAvatarMime,
  uploadUserAvatar,
} from '../../services/userAvatarService.js';
import { logger } from '../../utils/logger.js';
import { createSignedAssetUrl } from '../../utils/signedAssetUrl.js';

const router = Router();

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Same-origin path + cache-bust query so `<img>` reloads after each upload (JWT not sent on images). */
function uploadedAvatarPublicUrl(userId: string): string {
  const signed = createSignedAssetUrl(`/api/v1/users/avatar/${userId}`);
  return `${signed}&v=${Date.now()}`;
}

/** Public image URL for `<img src>` (JWT is not sent on image requests). Rate-limited. */
router.get('/avatar/:userId', apiRateLimiter, (req, res, next) => {
  void (async () => {
    try {
      const { userId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(404).end();
        return;
      }
      const assetPath = `/api/v1/users/avatar/${userId}`;
      const allowed = await requireSignedAssetOrAuth(req, res, assetPath);
      if (!allowed) {
        return;
      }
      const result = await getUserAvatarObject(userId);
      if (!result) {
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'private, no-cache');
      result.stream.on('error', (err) => {
        logger.error({ err, userId }, 'Avatar stream error');
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      result.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  })();
});

router.post(
  '/me/profile-picture',
  apiRateLimiter,
  requireAuth as RequestHandler,
  fileUploadRateLimiter,
  uploadAvatar.single('file'),
  (req, res, next) => {
    void (async () => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!req.file) {
          res.status(400).json({
            error: {
              message: 'File is required',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
        let avatarMime = req.file.mimetype;
        if (!isAllowedAvatarMime(avatarMime)) {
          const inferred = inferAvatarMimeFromBuffer(req.file.buffer);
          if (inferred !== null) {
            avatarMime = inferred;
          }
        }
        if (!isAllowedAvatarMime(avatarMime)) {
          res.status(400).json({
            error: {
              message: 'Avatar must be JPEG, PNG, or WebP',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
        const userId = authReq.user.id;
        await uploadUserAvatar(userId, req.file.buffer, avatarMime);
        const user = await User.findById(userId);
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
        user.profilePicture = uploadedAvatarPublicUrl(userId);
        await user.save();
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
    })();
  }
);

router.delete(
  '/me/profile-picture',
  apiRateLimiter,
  requireAuth as RequestHandler,
  (req, res, next) => {
    void (async () => {
      try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user.id;
        await deleteUserAvatar(userId);
        const existingUser = await User.findById(userId).select('googleId googleProfilePicture');
        const restoreGoogleAvatar =
          existingUser != null &&
          typeof existingUser.googleId === 'string' &&
          existingUser.googleId.trim() !== '' &&
          typeof existingUser.googleProfilePicture === 'string' &&
          existingUser.googleProfilePicture.trim() !== '';
        const update = restoreGoogleAvatar
          ? { $set: { profilePicture: existingUser.googleProfilePicture } }
          : { $unset: { profilePicture: 1 } };
        const user = await User.findByIdAndUpdate(userId, update, { new: true });
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
    })();
  }
);

export { router as userAvatarRoutes };
