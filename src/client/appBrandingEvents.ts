/** Fired after admin saves login screen branding so clients refetch public branding. */
export const LOGIN_BRANDING_UPDATED_EVENT = 'atlantisboard:login-branding-updated';

export function dispatchLoginBrandingUpdated(): void {
  window.dispatchEvent(new Event(LOGIN_BRANDING_UPDATED_EVENT));
}

/** Fired after admin saves app (homepage) branding. */
export const APP_BRANDING_UPDATED_EVENT = 'atlantisboard:app-branding-updated';

export function dispatchAppBrandingUpdated(): void {
  window.dispatchEvent(new Event(APP_BRANDING_UPDATED_EVENT));
}

/** Fired after custom fonts are uploaded or removed so branding font lists can refresh. */
export const FONTS_CATALOG_UPDATED_EVENT = 'atlantisboard:fonts-catalog-updated';

export function dispatchFontsCatalogUpdated(): void {
  window.dispatchEvent(new Event(FONTS_CATALOG_UPDATED_EVENT));
}
