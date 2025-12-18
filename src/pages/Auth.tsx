import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface AppSettings {
  custom_login_logo_enabled: boolean;
  custom_login_logo_url: string | null;
  custom_app_name_enabled: boolean;
  custom_app_name: string | null;
  custom_tagline_enabled: boolean;
  custom_tagline: string | null;
}

export default function Auth() {
  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('custom_login_logo_enabled, custom_login_logo_url, custom_app_name_enabled, custom_app_name, custom_tagline_enabled, custom_tagline')
        .eq('id', 'default')
        .single();

      if (data) {
        setSettings(data);
      }
    } catch (error) {
      // Settings not found, use defaults
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const showCustomLogo = settings?.custom_login_logo_enabled && settings?.custom_login_logo_url;
  const showCustomAppName = settings?.custom_app_name_enabled && settings?.custom_app_name;
  const showCustomTagline = settings?.custom_tagline_enabled && settings?.custom_tagline;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-kanban-bg via-background to-kanban-bg p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-4">
          {showCustomLogo && (
            <div className="flex justify-center">
              <img
                src={settings.custom_login_logo_url!}
                alt="Logo"
                className="w-[300px] h-[300px] object-contain"
              />
            </div>
          )}
          <div>
            <CardTitle className="text-2xl font-bold">
              {showCustomAppName ? settings.custom_app_name : 'KanBoard'}
            </CardTitle>
            <CardDescription className="mt-2">
              {showCustomTagline ? settings.custom_tagline : 'Sign in to manage your boards'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full h-12 text-base"
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
