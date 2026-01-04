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
      // Use the public endpoint which works before authentication
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';
      console.log('[useAppSettings] Attempting to fetch from:', API_BASE_URL);
      const response = await fetch(`${API_BASE_URL}/app-settings`);
      
      if (!response.ok) {
        // Try to parse error response, but don't fail if it's not JSON
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // Response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Extract only the fields we need from settings
      const settings = data.settings || null;
      if (settings) {
        setSettings({
          customHomeLogoEnabled: settings.customHomeLogoEnabled ?? false,
          customHomeLogoUrl: settings.customHomeLogoUrl ?? null,
          customHomeLogoSize: settings.customHomeLogoSize ?? 40,
          customBoardLogoEnabled: settings.customBoardLogoEnabled ?? false,
          customBoardLogoUrl: settings.customBoardLogoUrl ?? null,
          customBoardLogoSize: settings.customBoardLogoSize ?? 40,
          customGlobalAppNameEnabled: settings.customGlobalAppNameEnabled ?? false,
          customGlobalAppName: settings.customGlobalAppName ?? null,
        });
      }
      fetchedRef.current = true;
    } catch (error: unknown) {
      // Check if it's a connection error (backend not running)
      const isConnectionError = error?.message?.includes('Failed to fetch') || 
                                 error?.message?.includes('ERR_CONNECTION_REFUSED') ||
                                 error?.name === 'TypeError';
      
      if (isConnectionError) {
        // Backend not running - log once at warn level instead of error
        if (!fetchedRef.current) {
          console.warn('[useAppSettings] Backend server not available. Using default settings.');
        }
      } else {
        // Other errors - log normally
        console.error('Error fetching app settings:', error);
      }
      // Continue with default settings on error
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
