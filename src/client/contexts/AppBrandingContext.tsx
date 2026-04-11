import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../utils/api.js';
import { useBrandingWebFonts } from '../hooks/useBrandingWebFonts.js';
import { mergePublicLoginBranding, type PublicLoginBranding } from '../../shared/types/loginBranding.js';
import {
  mergePublicAppBranding,
  resolveAppUiFontStack,
  type PublicAppBranding,
} from '../../shared/types/appBranding.js';
import { DEFAULT_APP_DOCUMENT_TITLE } from '../constants/documentTitle.js';
import {
  APP_BRANDING_UPDATED_EVENT,
  LOGIN_BRANDING_UPDATED_EVENT,
} from '../appBrandingEvents.js';

const FALLBACK_BRANDING = mergePublicLoginBranding({}) as unknown as PublicLoginBranding;
const FALLBACK_APP_BRANDING = mergePublicAppBranding({}) as unknown as PublicAppBranding;

const FAVICON_LINK_ID = 'kanboard-app-branding-favicon';

export interface AppBrandingContextValue {
  readonly branding: PublicLoginBranding;
  readonly appBranding: PublicAppBranding;
  /** True after the first login + app branding fetch completes (success or failure). */
  readonly loginBrandingReady: boolean;
  readonly refetch: () => Promise<void>;
}

const AppBrandingContext = createContext<AppBrandingContextValue | null>(null);

export function AppBrandingProvider({ children }: { readonly children: ReactNode }) {
  const [branding, setBranding] = useState<PublicLoginBranding>(FALLBACK_BRANDING);
  const [appBranding, setAppBranding] = useState<PublicAppBranding>(FALLBACK_APP_BRANDING);
  const [loginBrandingReady, setLoginBrandingReady] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const [loginRes, appRes] = await Promise.allSettled([
        api.getLoginBranding(),
        api.getAppBranding(),
      ]);
      if (loginRes.status === 'fulfilled') {
        setBranding(loginRes.value.branding);
      }
      if (appRes.status === 'fulfilled') {
        setAppBranding(
          mergePublicAppBranding(appRes.value.appBranding) as unknown as PublicAppBranding
        );
      }
    } finally {
      setLoginBrandingReady(true);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const onUpdated = (): void => {
      void refetch();
    };
    window.addEventListener(LOGIN_BRANDING_UPDATED_EVENT, onUpdated);
    window.addEventListener(APP_BRANDING_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(LOGIN_BRANDING_UPDATED_EVENT, onUpdated);
      window.removeEventListener(APP_BRANDING_UPDATED_EVENT, onUpdated);
    };
  }, [refetch]);

  useBrandingWebFonts(
    branding.appNameFontFamily,
    branding.taglineFontFamily,
    appBranding.defaultUiFontFamily
  );

  useEffect(() => {
    const resolved = resolveAppUiFontStack(appBranding.defaultUiFontFamily);
    const root = document.documentElement;
    root.style.setProperty('--kb-app-ui-font-family', resolved);
    root.style.setProperty('--font-sans', resolved);
    root.style.setProperty('--default-font-family', resolved);
  }, [appBranding.defaultUiFontFamily]);

  useEffect(() => {
    if (!loginBrandingReady) {
      return;
    }
    if (branding.browserTabTitleEnabled && branding.browserTabTitle?.trim()) {
      document.title = branding.browserTabTitle.trim();
    } else {
      document.title = DEFAULT_APP_DOCUMENT_TITLE;
    }
  }, [loginBrandingReady, branding.browserTabTitle, branding.browserTabTitleEnabled]);

  useEffect(() => {
    if (!loginBrandingReady) {
      return;
    }
    const existing = document.getElementById(FAVICON_LINK_ID);
    if (existing) {
      existing.remove();
    }
    if (!branding.faviconEnabled || !branding.faviconUrl) {
      return;
    }
    const link = document.createElement('link');
    link.id = FAVICON_LINK_ID;
    link.rel = 'icon';
    link.href = branding.faviconUrl;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [loginBrandingReady, branding.faviconEnabled, branding.faviconUrl]);

  const value = useMemo(
    (): AppBrandingContextValue => ({
      branding,
      appBranding,
      loginBrandingReady,
      refetch,
    }),
    [branding, appBranding, loginBrandingReady, refetch]
  );

  return <AppBrandingContext.Provider value={value}>{children}</AppBrandingContext.Provider>;
}

export function useAppBranding(): AppBrandingContextValue {
  const ctx = useContext(AppBrandingContext);
  if (!ctx) {
    throw new Error('useAppBranding must be used within AppBrandingProvider');
  }
  return ctx;
}
