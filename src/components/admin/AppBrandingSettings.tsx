import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, Loader2, Image as ImageIcon, LayoutDashboard } from 'lucide-react';

interface AppBrandingState {
  custom_home_logo_enabled: boolean;
  custom_home_logo_url: string | null;
  custom_home_logo_size: number;
  custom_board_logo_enabled: boolean;
  custom_board_logo_url: string | null;
  custom_board_logo_size: number;
  custom_global_app_name_enabled: boolean;
  custom_global_app_name: string | null;
}

export function AppBrandingSettings() {
  const { refreshSettings } = useAppSettings();
  const [settings, setSettings] = useState<AppBrandingState>({
    custom_home_logo_enabled: false,
    custom_home_logo_url: null,
    custom_home_logo_size: 40,
    custom_board_logo_enabled: false,
    custom_board_logo_url: null,
    custom_board_logo_size: 40,
    custom_global_app_name_enabled: false,
    custom_global_app_name: null,
  });
  const [savedSettings, setSavedSettings] = useState<AppBrandingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingHomeLogo, setUploadingHomeLogo] = useState(false);
  const [uploadingBoardLogo, setUploadingBoardLogo] = useState(false);
  const [appNameInput, setAppNameInput] = useState('');
  const homeLogoInputRef = useRef<HTMLInputElement>(null);
  const boardLogoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('custom_home_logo_enabled, custom_home_logo_url, custom_home_logo_size, custom_board_logo_enabled, custom_board_logo_url, custom_board_logo_size, custom_global_app_name_enabled, custom_global_app_name')
        .eq('id', 'default')
        .single();

      if (error) throw error;
      if (data) {
        const loadedSettings: AppBrandingState = {
          custom_home_logo_enabled: data.custom_home_logo_enabled ?? false,
          custom_home_logo_url: data.custom_home_logo_url,
          custom_home_logo_size: data.custom_home_logo_size ?? 40,
          custom_board_logo_enabled: data.custom_board_logo_enabled ?? false,
          custom_board_logo_url: data.custom_board_logo_url,
          custom_board_logo_size: data.custom_board_logo_size ?? 40,
          custom_global_app_name_enabled: data.custom_global_app_name_enabled ?? false,
          custom_global_app_name: data.custom_global_app_name,
        };
        setSettings(loadedSettings);
        setSavedSettings(loadedSettings);
        setAppNameInput(data.custom_global_app_name || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasUnsavedChanges = () => {
    if (!savedSettings) return false;
    return (
      settings.custom_home_logo_enabled !== savedSettings.custom_home_logo_enabled ||
      settings.custom_home_logo_size !== savedSettings.custom_home_logo_size ||
      settings.custom_board_logo_enabled !== savedSettings.custom_board_logo_enabled ||
      settings.custom_board_logo_size !== savedSettings.custom_board_logo_size ||
      settings.custom_global_app_name_enabled !== savedSettings.custom_global_app_name_enabled ||
      appNameInput.trim() !== (savedSettings.custom_global_app_name || '')
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const updates = {
        custom_home_logo_enabled: settings.custom_home_logo_enabled,
        custom_home_logo_size: settings.custom_home_logo_size,
        custom_board_logo_enabled: settings.custom_board_logo_enabled,
        custom_board_logo_size: settings.custom_board_logo_size,
        custom_global_app_name_enabled: settings.custom_global_app_name_enabled,
        custom_global_app_name: appNameInput.trim() || null,
      };

      const { error } = await supabase
        .from('app_settings')
        .update(updates)
        .eq('id', 'default');

      if (error) throw error;

      const newSettings = { ...settings, custom_global_app_name: appNameInput.trim() || null };
      setSettings(newSettings);
      setSavedSettings(newSettings);

      // Refresh global app settings context
      await refreshSettings();

      toast({ title: 'Settings saved', description: 'App branding settings have been updated.' });
    } catch (error: any) {
      toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (
    file: File,
    type: 'home' | 'board',
    setUploading: (v: boolean) => void
  ) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image smaller than 2MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const urlKey = type === 'home' ? 'custom_home_logo_url' : 'custom_board_logo_url';
      const currentUrl = settings[urlKey];

      if (currentUrl) {
        const oldPath = currentUrl.split('/branding/')[1];
        if (oldPath) await supabase.storage.from('branding').remove([oldPath]);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('branding').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('branding').getPublicUrl(fileName);
      const { error } = await supabase.from('app_settings').update({ [urlKey]: urlData.publicUrl }).eq('id', 'default');
      if (error) throw error;

      setSettings(prev => ({ ...prev, [urlKey]: urlData.publicUrl }));
      setSavedSettings(prev => prev ? { ...prev, [urlKey]: urlData.publicUrl } : prev);
      await refreshSettings();
      toast({ title: 'Logo uploaded', description: `Your custom ${type} logo has been uploaded.` });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async (type: 'home' | 'board') => {
    const urlKey = type === 'home' ? 'custom_home_logo_url' : 'custom_board_logo_url';
    const enabledKey = type === 'home' ? 'custom_home_logo_enabled' : 'custom_board_logo_enabled';
    const currentUrl = settings[urlKey];

    if (!currentUrl) return;
    setSaving(true);
    try {
      const path = currentUrl.split('/branding/')[1];
      if (path) await supabase.storage.from('branding').remove([path]);
      const { error } = await supabase.from('app_settings').update({ [urlKey]: null, [enabledKey]: false }).eq('id', 'default');
      if (error) throw error;
      setSettings(prev => ({ ...prev, [urlKey]: null, [enabledKey]: false }));
      setSavedSettings(prev => prev ? { ...prev, [urlKey]: null, [enabledKey]: false } : prev);
      await refreshSettings();
    } catch (error: any) {
      toast({ title: 'Error removing logo', description: error.message, variant: 'destructive' });
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">App Branding</h2>
          <p className="text-muted-foreground">Customize the app-wide appearance and branding.</p>
        </div>
        <Button onClick={handleSaveAll} disabled={saving || !hasUnsavedChanges()}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>

      <div className="space-y-6">
        {/* App Name Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">App Name</CardTitle>
            <CardDescription>Customize the app name displayed throughout the application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="app-name-toggle" className="font-medium">Enable custom app name</Label>
              <Switch
                id="app-name-toggle"
                checked={settings.custom_global_app_name_enabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, custom_global_app_name_enabled: checked }))}
              />
            </div>
            {settings.custom_global_app_name_enabled && (
              <div className="space-y-2">
                <Label htmlFor="app-name-input">App Name</Label>
                <Input
                  id="app-name-input"
                  value={appNameInput}
                  onChange={(e) => setAppNameInput(e.target.value)}
                  placeholder="Enter custom app name"
                  maxLength={50}
                />
              </div>
            )}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Preview:</p>
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold">
                  {settings.custom_global_app_name_enabled && appNameInput.trim() ? appNameInput.trim() : 'KanBoard'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Home Logo Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Homepage Logo</CardTitle>
            <CardDescription>Customize the logo displayed on the board homepage (top-left).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="home-logo-toggle" className="font-medium">Enable custom homepage logo</Label>
              <Switch
                id="home-logo-toggle"
                checked={settings.custom_home_logo_enabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, custom_home_logo_enabled: checked }))}
                disabled={!settings.custom_home_logo_url}
              />
            </div>

            <div className="space-y-2">
              <Label>Logo Image</Label>
              <div className="flex items-center gap-3">
                {settings.custom_home_logo_url ? (
                  <div className="relative w-16 h-16 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    <img src={settings.custom_home_logo_url} alt="Home logo" className="max-w-full max-h-full object-contain" />
                    <button
                      onClick={() => handleRemoveLogo('home')}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <input
                    ref={homeLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file, 'home', setUploadingHomeLogo);
                      if (homeLogoInputRef.current) homeLogoInputRef.current.value = '';
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => homeLogoInputRef.current?.click()} disabled={uploadingHomeLogo}>
                    {uploadingHomeLogo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB</p>
                </div>
              </div>
            </div>

            {settings.custom_home_logo_url && (
              <div className="space-y-2">
                <Label>Logo Size: {settings.custom_home_logo_size}px</Label>
                <Slider
                  value={[settings.custom_home_logo_size]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, custom_home_logo_size: value }))}
                  min={10}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
            )}

            {settings.custom_home_logo_url && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                <div className="flex items-center gap-2 bg-card p-2 rounded border">
                  <img
                    src={settings.custom_home_logo_url}
                    alt="Home logo preview"
                    style={{ width: settings.custom_home_logo_size, height: settings.custom_home_logo_size }}
                    className="object-contain"
                  />
                  <span className="text-xl font-bold">
                    {settings.custom_global_app_name_enabled && appNameInput.trim() ? appNameInput.trim() : 'KanBoard'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Board Logo Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Board Page Logo</CardTitle>
            <CardDescription>Customize the logo displayed when viewing a board (top-left).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="board-logo-toggle" className="font-medium">Enable custom board page logo</Label>
              <Switch
                id="board-logo-toggle"
                checked={settings.custom_board_logo_enabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, custom_board_logo_enabled: checked }))}
                disabled={!settings.custom_board_logo_url}
              />
            </div>

            <div className="space-y-2">
              <Label>Logo Image</Label>
              <div className="flex items-center gap-3">
                {settings.custom_board_logo_url ? (
                  <div className="relative w-16 h-16 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    <img src={settings.custom_board_logo_url} alt="Board logo" className="max-w-full max-h-full object-contain" />
                    <button
                      onClick={() => handleRemoveLogo('board')}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <input
                    ref={boardLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file, 'board', setUploadingBoardLogo);
                      if (boardLogoInputRef.current) boardLogoInputRef.current.value = '';
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => boardLogoInputRef.current?.click()} disabled={uploadingBoardLogo}>
                    {uploadingBoardLogo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB</p>
                </div>
              </div>
            </div>

            {settings.custom_board_logo_url && (
              <div className="space-y-2">
                <Label>Logo Size: {settings.custom_board_logo_size}px</Label>
                <Slider
                  value={[settings.custom_board_logo_size]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, custom_board_logo_size: value }))}
                  min={10}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
            )}

            {settings.custom_board_logo_url && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                <div className="flex items-center gap-2 bg-card p-2 rounded border">
                  <img
                    src={settings.custom_board_logo_url}
                    alt="Board logo preview"
                    style={{ width: settings.custom_board_logo_size, height: settings.custom_board_logo_size }}
                    className="object-contain"
                  />
                  <span className="text-xl font-bold">Board Name</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
