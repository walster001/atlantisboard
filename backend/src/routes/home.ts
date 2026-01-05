import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { homeService } from '../services/home.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/home/data - Get home page data (replaces get_home_data function)
router.get('/data', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const data = await homeService.getHomeData(authReq.userId!, authReq.user?.isAdmin ?? false);
    res.json(data);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;

