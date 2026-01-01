import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../db/client.js';
import { ForbiddenError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/app-settings - Get app settings (public for auth page)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
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
      settings: settings ? {
        custom_login_logo_enabled: settings.customLoginLogoEnabled,
        custom_login_logo_url: settings.customLoginLogoUrl,
        custom_login_logo_size: settings.customLoginLogoSize,
        custom_app_name_enabled: settings.customAppNameEnabled,
        custom_app_name: settings.customAppName,
        custom_app_name_size: settings.customAppNameSize,
        custom_app_name_color: settings.customAppNameColor,
        custom_app_name_font: settings.customAppNameFont,
        custom_tagline_enabled: settings.customTaglineEnabled,
        custom_tagline: settings.customTagline,
        custom_tagline_size: settings.customTaglineSize,
        custom_tagline_color: settings.customTaglineColor,
        custom_tagline_font: settings.customTaglineFont,
        custom_login_background_enabled: settings.customLoginBackgroundEnabled,
        custom_login_background_type: settings.customLoginBackgroundType,
        custom_login_background_color: settings.customLoginBackgroundColor,
        custom_login_background_image_url: settings.customLoginBackgroundImageUrl,
        custom_login_box_background_color: settings.customLoginBoxBackgroundColor,
        custom_google_button_background_color: settings.customGoogleButtonBackgroundColor,
        custom_google_button_text_color: settings.customGoogleButtonTextColor,
        login_style: settings.loginStyle,
      } : null,
      fonts: fonts.map(font => ({
        id: font.id,
        name: font.name,
        font_url: font.fontUrl,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/app-settings - Update app settings (admin only)
router.patch('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) {
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

