import type { IAppScreenBranding } from '../models/AdminConfig.js';
import {
  type PublicAppBranding,
  clampAppNavbarIconSizePx,
  DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX,
  DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX,
} from '../../shared/types/appBranding.js';
import { rewriteBrandingPathToSigned } from '../utils/signedAssetUrl.js';

const DEFAULT_TEXT = '#212529';
const DEFAULT_NAV_BG = '#ffffff';
const DEFAULT_PAGE_BG = '#f8f9fa';

export function toPublicAppBranding(
  ab: IAppScreenBranding | undefined | null
): PublicAppBranding {
  const b = ab ?? {};
  const mode = b.homepageBackgroundMode === 'image' ? 'image' : 'color';
  const icon = b.homepageNavbarIconUrl?.trim();
  const label = b.homepageNavbarLabel?.trim();
  const bgImg = b.homepageBackgroundImageUrl?.trim();
  const boardIcon = b.boardNavbarIconUrl?.trim();
  const textC = b.homepageNavbarTextColor?.trim();
  const navC = b.homepageNavbarColor?.trim();
  const pageC = b.homepageBackgroundColor?.trim();
  const defaultFont = b.defaultUiFontFamily?.trim();
  return {
    homepageNavbarUseLoginFavicon: b.homepageNavbarUseLoginFavicon ?? true,
    homepageNavbarIconSizePx: clampAppNavbarIconSizePx(
      b.homepageNavbarIconSizePx,
      DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX
    ),
    homepageNavbarLabelInheritAppName: b.homepageNavbarLabelInheritAppName ?? false,
    homepageNavbarTextColor: textC && textC.length > 0 ? textC : DEFAULT_TEXT,
    homepageNavbarColor: navC && navC.length > 0 ? navC : DEFAULT_NAV_BG,
    homepageBackgroundMode: mode,
    homepageBackgroundColor: pageC && pageC.length > 0 ? pageC : DEFAULT_PAGE_BG,
    boardNavbarIconSameAsHomepage: b.boardNavbarIconSameAsHomepage ?? false,
    boardNavbarIconSizePx: clampAppNavbarIconSizePx(
      b.boardNavbarIconSizePx,
      DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX
    ),
    ...(icon ? { homepageNavbarIconUrl: rewriteBrandingPathToSigned(icon) ?? icon } : {}),
    ...(label ? { homepageNavbarLabel: label } : {}),
    ...(bgImg ? { homepageBackgroundImageUrl: rewriteBrandingPathToSigned(bgImg) ?? bgImg } : {}),
    ...(boardIcon ? { boardNavbarIconUrl: rewriteBrandingPathToSigned(boardIcon) ?? boardIcon } : {}),
    ...(defaultFont ? { defaultUiFontFamily: defaultFont } : {}),
  };
}
