import { Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { ImportJob } from '../../models/ImportJob.js';

const router = Router();

// Get import job status
router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const job = await ImportJob.findById(req.params.jobId);

    if (!job) {
      res.status(404).json({
        error: {
          message: 'Import job not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    // Check ownership
    if (job.userId.toString() !== authReq.user.id) {
      res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    res.json({ job });
  } catch (error) {
    next(error);
  }
});

export { router as importJobsRoutes };
