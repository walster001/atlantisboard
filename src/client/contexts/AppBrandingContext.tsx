import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../utils/api.js';
import { useBrandingWebFonts } from '../hooks/useBrandingWebFonts.js';
import {
  DEFAULT_TAB_FAVICON_HREF,
  mergePublicLoginBranding,
  resolveBrowserTabFaviconHref,
  type PublicLoginBranding,
} from '../../shared/types/loginBranding.js';
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

const FAVICON_LINK_ID = 'atlantisboard-app-branding-favicon';
function resolveBrandingFontStack(preferredFamily: string | undefined, fallback: string): string {
  const trimmed = typeof preferredFamily === 'string' ? preferredFamily.trim() : '';
  if (trimmed === '') {
    return fallback;
  }
  return `${trimmed}, ${fallback}`;
}

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
  const aliveRef = useRef(true);
  const refetchGenRef = useRef(0);

  const refetch = useCallback(async () => {
    const runGen = ++refetchGenRef.current;
    try {
      const [loginRes, appRes] = await Promise.allSettled([
        api.getLoginBranding(),
        api.getAppBranding(),
      ]);
      if (!aliveRef.current || refetchGenRef.current !== runGen) {
        return;
      }
      if (loginRes.status === 'fulfilled') {
        setBranding(loginRes.value.branding);
      }
      if (appRes.status === 'fulfilled') {
        setAppBranding(
          mergePublicAppBranding(appRes.value.appBranding) as unknown as PublicAppBranding
        );
      }
    } finally {
      if (aliveRef.current && refetchGenRef.current === runGen) {
        setLoginBrandingReady(true);
      }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refetch();
    return () => {
      aliveRef.current = false;
      refetchGenRef.current += 1;
    };
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
    const appNameStack = resolveBrandingFontStack(branding.appNameFontFamily, resolved);
    const taglineStack = resolveBrandingFontStack(branding.taglineFontFamily, resolved);
    root.style.setProperty('--kb-app-ui-font-family', resolved);
    root.style.setProperty('--kb-branding-app-name-font-family', appNameStack);
    root.style.setProperty('--kb-branding-tagline-font-family', taglineStack);
    root.style.setProperty('--font-sans', resolved);
    root.style.setProperty('--default-font-family', resolved);
  }, [appBranding.defaultUiFontFamily, branding.appNameFontFamily, branding.taglineFontFamily]);

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
    let link = document.getElementById(FAVICON_LINK_ID) as HTMLLinkElement | null;
    if (link == null) {
      link = document.createElement('link');
      link.id = FAVICON_LINK_ID;
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (!loginBrandingReady) {
      link.href = DEFAULT_TAB_FAVICON_HREF;
      return;
    }
    link.href = resolveBrowserTabFaviconHref(branding);
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
