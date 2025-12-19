import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type LoginStyle = 'local_accounts' | 'google_only' | 'google_verified';

interface LoginOptionsState {
  login_style: LoginStyle;
}

const loginStyleOptions: { value: LoginStyle; label: string; description: string }[] = [
  {
    value: 'local_accounts',
    label: 'Local Accounts',
    description: 'Users can sign up and log in with email and password. Signup form is visible.',
  },
  {
    value: 'google_only',
    label: 'Google Login Only',
    description: 'Only Google authentication is available. Email/password fields and signup are hidden.',
  },
  {
    value: 'google_verified',
    label: 'Google Login + Database Verification',
    description: 'Google login with additional database verification (verification logic to be configured separately).',
  },
];

export function LoginOptionsSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<LoginOptionsState>({
    login_style: 'google_only',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('login_style')
        .eq('id', 'default')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          login_style: (data.login_style as LoginStyle) || 'google_only',
        });
      }
    } catch (error) {
      console.error('Error fetching login options:', error);
      toast({
        title: 'Error',
        description: 'Failed to load login options.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          id: 'default',
          login_style: settings.login_style,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings saved',
        description: 'Login options have been updated successfully.',
      });
    } catch (error) {
      console.error('Error saving login options:', error);
      toast({
        title: 'Error',
        description: 'Failed to save login options.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedOption = loginStyleOptions.find(opt => opt.value === settings.login_style);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Login Options</h2>
          <p className="text-muted-foreground">
            Configure how users authenticate with your application.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Login Style</CardTitle>
          <CardDescription>
            Choose how users will authenticate with your application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-style">Authentication Method</Label>
            <Select
              value={settings.login_style}
              onValueChange={(value: LoginStyle) => 
                setSettings(prev => ({ ...prev, login_style: value }))
              }
            >
              <SelectTrigger id="login-style" className="w-full max-w-md">
                <SelectValue placeholder="Select login style" />
              </SelectTrigger>
              <SelectContent>
                {loginStyleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOption && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {selectedOption.description}
              </AlertDescription>
            </Alert>
          )}

          {settings.login_style === 'google_verified' && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <Info className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                Note: The database verification logic for this option needs to be configured separately. 
                Currently, this option behaves the same as "Google Login Only".
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}