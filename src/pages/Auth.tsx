import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface AppSettings {
  custom_login_logo_enabled: boolean;
  custom_login_logo_url: string | null;
  custom_login_logo_size: string;
  custom_app_name_enabled: boolean;
  custom_app_name: string | null;
  custom_app_name_size: number;
  custom_app_name_color: string;
  custom_app_name_font: string;
  custom_tagline_enabled: boolean;
  custom_tagline: string | null;
  custom_tagline_size: number;
  custom_tagline_color: string;
  custom_tagline_font: string;
  custom_login_background_enabled: boolean;
  custom_login_background_type: string;
  custom_login_background_color: string;
  custom_login_background_image_url: string | null;
  custom_login_box_background_color: string;
  custom_google_button_background_color: string;
  custom_google_button_text_color: string;
}

interface CustomFont {
  id: string;
  name: string;
  font_url: string;
}

interface AuthPageData {
  settings: AppSettings | null;
  fonts: CustomFont[];
}

const logoSizeMap: Record<string, string> = {
  small: 'w-[100px] h-[100px]',
  medium: 'w-[200px] h-[200px]',
  large: 'w-[300px] h-[300px]',
};

export default function Auth() {
  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pageData, setPageData] = useState<AuthPageData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Single server-side call for all auth page data
  useEffect(() => {
    const fetchPageData = async () => {
      try {
        const { data, error } = await supabase.rpc('get_auth_page_data');
        if (error) throw error;
        const result = data as unknown as AuthPageData;
        setPageData(result);
      } catch (error) {
        // Use defaults on error
        setPageData({ settings: null, fonts: [] });
      } finally {
        setDataLoading(false);
      }
    };
    fetchPageData();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  // Load custom fonts
  useEffect(() => {
    const fonts = pageData?.fonts || [];
    if (fonts.length === 0) {
      setFontsLoaded(true);
      return;
    }

    fonts.forEach((font) => {
      const fontId = `custom-font-${font.id}`;
      if (!document.getElementById(fontId)) {
        const style = document.createElement('style');
        style.id = fontId;
        style.textContent = `
          @font-face {
            font-family: '${font.name}';
            src: url('${font.font_url}') format('woff2'), url('${font.font_url}') format('woff'), url('${font.font_url}') format('truetype');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
      }
    });
    // Allow fonts to load
    requestAnimationFrame(() => setFontsLoaded(true));
  }, [pageData?.fonts]);

  const getFontFamily = useCallback((fontKey: string | undefined) => {
    if (!fontKey || fontKey === 'default') return 'Inter, sans-serif';
    const font = pageData?.fonts?.find(f => f.id === fontKey);
    return font ? `'${font.name}', sans-serif` : 'Inter, sans-serif';
  }, [pageData?.fonts]);

  const handleGoogleSignIn = useCallback(async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [signInWithGoogle, toast]);

  // Memoize computed values
  const brandingConfig = useMemo(() => {
    const settings = pageData?.settings;
    const showCustomLogo = settings?.custom_login_logo_enabled && settings?.custom_login_logo_url;
    const showCustomAppName = settings?.custom_app_name_enabled && settings?.custom_app_name;
    const showCustomTagline = settings?.custom_tagline_enabled && settings?.custom_tagline;
    const useCustomBackground = settings?.custom_login_background_enabled;
    
    return {
      showCustomLogo,
      logoUrl: settings?.custom_login_logo_url,
      logoSize: logoSizeMap[settings?.custom_login_logo_size || 'medium'] || logoSizeMap.medium,
      appName: showCustomAppName ? settings!.custom_app_name : 'KanBoard',
      tagline: showCustomTagline ? settings!.custom_tagline : 'Sign in to manage your boards',
      appNameSize: settings?.custom_app_name_size || 24,
      appNameColor: settings?.custom_app_name_color || '#000000',
      appNameFont: getFontFamily(settings?.custom_app_name_font),
      taglineSize: settings?.custom_tagline_size || 14,
      taglineColor: settings?.custom_tagline_color || '#6b7280',
      taglineFont: getFontFamily(settings?.custom_tagline_font),
      // Background settings
      useCustomBackground,
      backgroundType: settings?.custom_login_background_type || 'color',
      backgroundColor: settings?.custom_login_background_color || '#f3f4f6',
      backgroundImageUrl: settings?.custom_login_background_image_url,
      // Box and button settings
      boxBackgroundColor: settings?.custom_login_box_background_color || '#ffffff',
      googleButtonBackgroundColor: settings?.custom_google_button_background_color || '#ffffff',
      googleButtonTextColor: settings?.custom_google_button_text_color || '#000000',
    };
  }, [pageData?.settings, getFontFamily]);

  // Compute background styles
  const backgroundStyles = useMemo(() => {
    if (!brandingConfig.useCustomBackground) {
      return {};
    }
    
    if (brandingConfig.backgroundType === 'image' && brandingConfig.backgroundImageUrl) {
      return {
        backgroundImage: `url(${brandingConfig.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }
    
    return {
      backgroundColor: brandingConfig.backgroundColor,
    };
  }, [brandingConfig]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div 
      className={`min-h-screen flex items-center justify-center p-4 ${
        !brandingConfig.useCustomBackground ? 'bg-gradient-to-br from-kanban-bg via-background to-kanban-bg' : ''
      }`}
      style={backgroundStyles}
    >
      <Card 
        className="w-full max-w-lg border-0 shadow-lg"
        style={{ backgroundColor: brandingConfig.boxBackgroundColor }}
      >
        <CardHeader className="text-center space-y-4">
          {brandingConfig.showCustomLogo && (
            <div className="flex justify-center">
              <img
                src={brandingConfig.logoUrl!}
                alt="Logo"
                className={`${brandingConfig.logoSize} object-contain`}
              />
            </div>
          )}
          <div className="space-y-2">
            <h1 
              className="font-bold text-center" 
              style={{ 
                fontSize: `${brandingConfig.appNameSize}px`, 
                color: brandingConfig.appNameColor,
                fontFamily: brandingConfig.appNameFont,
              }}
            >
              {brandingConfig.appName}
            </h1>
            <p 
              className="text-center max-w-md mx-auto leading-relaxed" 
              style={{ 
                fontSize: `${brandingConfig.taglineSize}px`, 
                color: brandingConfig.taglineColor,
                fontFamily: brandingConfig.taglineFont,
              }}
            >
              {brandingConfig.tagline}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full h-12 text-base border"
            style={{
              backgroundColor: brandingConfig.googleButtonBackgroundColor,
              color: brandingConfig.googleButtonTextColor,
            }}
            onClick={handleGoogleSignIn}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}