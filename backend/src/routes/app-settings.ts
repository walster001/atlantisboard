import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../db/client.js';
import { ForbiddenError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/app-settings - Get app settings (public for auth page)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
    });

    const fonts = await prisma.customFont.findMany({
      select: {
        id: true,
        name: true,
        fontUrl: true,
      },
    });

    res.json({
      settings: settings,
      fonts: fonts,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/app-settings - Update app settings (admin only)
router.patch('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    if (!authReq.user?.isAdmin) {
      throw new ForbiddenError('Admin access required');
    }

    const updated = await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: req.body,
      create: {
        id: 'default',
        ...req.body,
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;

