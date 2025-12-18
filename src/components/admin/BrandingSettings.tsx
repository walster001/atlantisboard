import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';

interface AppSettings {
  custom_login_logo_enabled: boolean;
  custom_login_logo_url: string | null;
  custom_app_name_enabled: boolean;
  custom_app_name: string | null;
  custom_tagline_enabled: boolean;
  custom_tagline: string | null;
}

export function BrandingSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    custom_login_logo_enabled: false,
    custom_login_logo_url: null,
    custom_app_name_enabled: false,
    custom_app_name: null,
    custom_tagline_enabled: false,
    custom_tagline: null,
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appNameInput, setAppNameInput] = useState('');
  const [taglineInput, setTaglineInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('custom_login_logo_enabled, custom_login_logo_url, custom_app_name_enabled, custom_app_name, custom_tagline_enabled, custom_tagline')
        .eq('id', 'default')
        .single();

      if (error) throw error;
      if (data) {
        setSettings({
          custom_login_logo_enabled: data.custom_login_logo_enabled,
          custom_login_logo_url: data.custom_login_logo_url,
          custom_app_name_enabled: data.custom_app_name_enabled,
          custom_app_name: data.custom_app_name,
          custom_tagline_enabled: data.custom_tagline_enabled,
          custom_tagline: data.custom_tagline,
        });
        setAppNameInput(data.custom_app_name || '');
        setTaglineInput(data.custom_tagline || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<AppSettings>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update(updates)
        .eq('id', 'default');

      if (error) throw error;

      setSettings(prev => ({ ...prev, ...updates }));
      toast({
        title: 'Settings saved',
        description: 'Branding settings have been updated.',
      });
    } catch (error: any) {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoToggle = (enabled: boolean) => {
    updateSettings({ custom_login_logo_enabled: enabled });
  };

  const handleAppNameToggle = (enabled: boolean) => {
    updateSettings({ custom_app_name_enabled: enabled });
  };

  const handleAppNameSave = () => {
    if (appNameInput.trim()) {
      updateSettings({ custom_app_name: appNameInput.trim() });
    }
  };

  const handleTaglineToggle = (enabled: boolean) => {
    updateSettings({ custom_tagline_enabled: enabled });
  };

  const handleTaglineSave = () => {
    if (taglineInput.trim()) {
      updateSettings({ custom_tagline: taglineInput.trim() });
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image smaller than 2MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      if (settings.custom_login_logo_url) {
        const oldPath = settings.custom_login_logo_url.split('/branding/')[1];
        if (oldPath) {
          await supabase.storage.from('branding').remove([oldPath]);
        }
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `login-logo-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(fileName);

      await updateSettings({ custom_login_logo_url: urlData.publicUrl });

      toast({
        title: 'Logo uploaded',
        description: 'Your custom login logo has been uploaded.',
      });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!settings.custom_login_logo_url) return;

    setSaving(true);
    try {
      const path = settings.custom_login_logo_url.split('/branding/')[1];
      if (path) {
        await supabase.storage.from('branding').remove([path]);
      }

      await updateSettings({ 
        custom_login_logo_url: null,
        custom_login_logo_enabled: false 
      });
    } catch (error: any) {
      toast({
        title: 'Error removing logo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Branding</h2>
        <p className="text-muted-foreground">
          Customize the appearance of your application.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Login Logo</CardTitle>
          <CardDescription>
            Display a custom logo on the Google sign-in screen instead of the default application name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="logo-toggle" className="font-medium">
              Enable custom logo
            </Label>
            <Switch
              id="logo-toggle"
              checked={settings.custom_login_logo_enabled}
              onCheckedChange={handleLogoToggle}
              disabled={saving || !settings.custom_login_logo_url}
            />
          </div>

          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-3 block">Logo Image</Label>
            
            {settings.custom_login_logo_url ? (
              <div className="space-y-3">
                <div className="relative inline-block">
                  <img
                    src={settings.custom_login_logo_url}
                    alt="Login logo preview"
                    className="max-h-24 max-w-full rounded-md border bg-muted object-contain p-2"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={handleRemoveLogo}
                    disabled={saving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Replace Logo
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                )}
                <p className="text-sm text-muted-foreground">
                  {uploading ? 'Uploading...' : 'Click to upload a logo'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG or SVG (max 2MB)
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {!settings.custom_login_logo_url && (
            <p className="text-xs text-muted-foreground">
              Upload a logo to enable the custom login logo feature.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom App Name</CardTitle>
          <CardDescription>
            Display a custom application name below the logo on the sign-in screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="appname-toggle" className="font-medium">
              Enable custom app name
            </Label>
            <Switch
              id="appname-toggle"
              checked={settings.custom_app_name_enabled}
              onCheckedChange={handleAppNameToggle}
              disabled={saving || !settings.custom_app_name}
            />
          </div>

          <div className="border-t pt-4">
            <Label htmlFor="app-name-input" className="text-sm font-medium mb-3 block">
              Application Name
            </Label>
            <div className="flex gap-2">
              <Input
                id="app-name-input"
                placeholder="Enter your application name"
                value={appNameInput}
                onChange={(e) => setAppNameInput(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleAppNameSave}
                disabled={saving || !appNameInput.trim() || appNameInput.trim() === settings.custom_app_name}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>

          {!settings.custom_app_name && (
            <p className="text-xs text-muted-foreground">
              Enter an app name to enable this feature.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Tagline</CardTitle>
          <CardDescription>
            Display a custom tagline below the app name on the sign-in screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="tagline-toggle" className="font-medium">
              Enable custom tagline
            </Label>
            <Switch
              id="tagline-toggle"
              checked={settings.custom_tagline_enabled}
              onCheckedChange={handleTaglineToggle}
              disabled={saving || !settings.custom_tagline}
            />
          </div>

          <div className="border-t pt-4">
            <Label htmlFor="tagline-input" className="text-sm font-medium mb-3 block">
              Tagline Text
            </Label>
            <div className="flex gap-2">
              <Input
                id="tagline-input"
                placeholder="Enter your tagline"
                value={taglineInput}
                onChange={(e) => setTaglineInput(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleTaglineSave}
                disabled={saving || !taglineInput.trim() || taglineInput.trim() === settings.custom_tagline}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>

          {!settings.custom_tagline && (
            <p className="text-xs text-muted-foreground">
              Enter a tagline to enable this feature.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}