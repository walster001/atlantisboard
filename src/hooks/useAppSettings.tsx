import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
}

const defaultAppName = 'KanBoard';

const AppSettingsContext = createContext<AppSettingsContextType>({
  settings: null,
  loading: true,
  appName: defaultAppName,
  refreshSettings: async () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('custom_home_logo_enabled, custom_home_logo_url, custom_home_logo_size, custom_board_logo_enabled, custom_board_logo_url, custom_board_logo_size, custom_global_app_name_enabled, custom_global_app_name')
        .eq('id', 'default')
        .single();

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error('Error fetching app settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const appName = settings?.custom_global_app_name_enabled && settings?.custom_global_app_name
    ? settings.custom_global_app_name
    : defaultAppName;

  return (
    <AppSettingsContext.Provider value={{ settings, loading, appName, refreshSettings: fetchSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
