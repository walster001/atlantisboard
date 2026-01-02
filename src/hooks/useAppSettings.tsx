import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { api } from '@/integrations/api/client';

interface AppSettings {
  customHomeLogoEnabled: boolean;
  customHomeLogoUrl: string | null;
  customHomeLogoSize: number;
  customBoardLogoEnabled: boolean;
  customBoardLogoUrl: string | null;
  customBoardLogoSize: number;
  customGlobalAppNameEnabled: boolean;
  customGlobalAppName: string | null;
}

interface AppSettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
  appName: string;
  refreshSettings: () => Promise<void>;
}

const defaultAppName = 'KanBoard';

const AppSettingsContext = createContext<AppSettingsContextType>({
  settings: null,
  loading: false,
  appName: defaultAppName,
  refreshSettings: async () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  const fetchingRef = useRef(false);

  const fetchSettings = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await api
        .from('app_settings')
        .select('customHomeLogoEnabled, customHomeLogoUrl, customHomeLogoSize, customBoardLogoEnabled, customBoardLogoUrl, customBoardLogoSize, customGlobalAppNameEnabled, customGlobalAppName')
        .eq('id', 'default')
        .single();

      if (error) throw error;
      setSettings(data);
      fetchedRef.current = true;
    } catch (error: any) {
      // Only log non-401 errors (401 is expected when not authenticated for public endpoints)
      // The app will work fine with default settings
      const isAuthError = error?.status === 401 || 
                         error?.code === 'PGRST116' || 
                         error?.message?.includes('Invalid authentication credentials') ||
                         error?.message?.includes('JWT');
      if (!isAuthError) {
        console.error('Error fetching app settings:', error);
      }
      fetchedRef.current = true;
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // Force refresh (for admin updates)
  const refreshSettings = useCallback(async () => {
    fetchedRef.current = false;
    await fetchSettings();
  }, [fetchSettings]);

  // Fetch on first render for authenticated pages
  useEffect(() => {
    if (!fetchedRef.current && !fetchingRef.current) {
      fetchSettings();
    }
  }, [fetchSettings]);

  const appName = settings?.customGlobalAppNameEnabled && settings?.customGlobalAppName
    ? settings.customGlobalAppName
    : defaultAppName;

  return (
    <AppSettingsContext.Provider value={{ settings, loading, appName, refreshSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
