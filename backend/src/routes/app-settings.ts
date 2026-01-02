import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../db/client.js';
import { ForbiddenError } from '../middleware/errorHandler.js';
import { Prisma } from '@prisma/client';

const router = Router();

// GET /api/app-settings - Get app settings (public for auth page)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify Prisma client is connected (this will throw if connection fails)
    await prisma.$connect().catch(() => {
      // Connection already established or will be established on first query
    });
    
    // Try to find existing settings first
    let settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
    });

    // If no settings exist, create default ones
    if (!settings) {
      try {
        settings = await prisma.appSettings.create({
          data: {
            id: 'default',
          },
        });
      } catch (createError: any) {
        // If create fails, try to find again (race condition)
        console.error('[app-settings] Error creating settings:', createError);
        // Check if it's a unique constraint violation (another request created it)
        if (createError?.code === 'P2002') {
          // Try to find again
          settings = await prisma.appSettings.findUnique({
            where: { id: 'default' },
          });
        }
        if (!settings) {
          // Log the full error for debugging
          console.error('[app-settings] Failed to create or find settings:', {
            error: createError,
            code: createError?.code,
            message: createError?.message,
            meta: createError?.meta,
          });
          throw createError;
        }
      }
    }

    // Fetch fonts - handle case where table might not exist or query fails
    let fonts = [];
    try {
      fonts = await prisma.customFont.findMany({
        select: {
          id: true,
          name: true,
          fontUrl: true,
        },
      });
    } catch (fontError: any) {
      // Log font error but don't fail the request - fonts are optional
      console.warn('[app-settings] Error fetching fonts:', fontError);
      fonts = [];
    }

    res.json({
      settings: settings,
      fonts: fonts,
    });
  } catch (error: any) {
    // Enhanced error logging with Prisma-specific error handling
    const errorDetails: any = {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    };
    
    // Check for Prisma-specific errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorDetails.prismaError = true;
      errorDetails.code = error.code;
      errorDetails.meta = error.meta;
      
      // Handle specific Prisma error codes
      if (error.code === 'P1001') {
        errorDetails.message = 'Database connection error - cannot reach database server';
      } else if (error.code === 'P2002') {
        errorDetails.message = 'Unique constraint violation';
      } else if (error.code === 'P2025') {
        errorDetails.message = 'Record not found';
      }
    } else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      errorDetails.prismaError = true;
      errorDetails.message = 'Unknown Prisma database error';
    } else if (error instanceof Prisma.PrismaClientRustPanicError) {
      errorDetails.prismaError = true;
      errorDetails.message = 'Prisma engine panic - database may be corrupted';
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
      errorDetails.prismaError = true;
      errorDetails.message = 'Prisma client initialization error - check DATABASE_URL';
    }
    
    console.error('[app-settings] GET error:', errorDetails);
    if (process.env.NODE_ENV === 'development') {
      console.error('[app-settings] Full error stack:', error?.stack);
    }
    
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

