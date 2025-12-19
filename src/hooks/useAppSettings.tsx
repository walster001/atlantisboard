import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AppSettings {
  custom_home_logo_enabled: boolean;
  custom_home_logo_url: string | null;
  custom_home_logo_size: number;
  custom_board_logo_enabled: boolean;
  custom_board_logo_url: string | null;
  custom_board_logo_size: number;
  custom_global_app_name_enabled: boolean;
  custom_global_app_name: string | null;
}

interface AppSettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
  appName: string;
  refreshSettings: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
}

const defaultAppName = 'KanBoard';

const AppSettingsContext = createContext<AppSettingsContextType>({
  settings: null,
  loading: false,
  appName: defaultAppName,
  refreshSettings: async () => {},
  ensureLoaded: async () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('custom_home_logo_enabled, custom_home_logo_url, custom_home_logo_size, custom_board_logo_enabled, custom_board_logo_url, custom_board_logo_size, custom_global_app_name_enabled, custom_global_app_name')
        .eq('id', 'default')
        .single();

      if (error) throw error;
      setSettings(data);
      setHasFetched(true);
    } catch (error) {
      console.error('Error fetching app settings:', error);
      setHasFetched(true);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Lazy load - only fetch when explicitly requested
  const ensureLoaded = useCallback(async () => {
    if (!hasFetched && !loading) {
      await fetchSettings();
    }
  }, [hasFetched, loading, fetchSettings]);

  const appName = settings?.custom_global_app_name_enabled && settings?.custom_global_app_name
    ? settings.custom_global_app_name
    : defaultAppName;

  return (
    <AppSettingsContext.Provider value={{ settings, loading, appName, refreshSettings: fetchSettings, ensureLoaded }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
