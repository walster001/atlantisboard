import { useState, useEffect, useRef } from 'react';
import { api } from '@/integrations/api/client';
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
  customHomeLogoEnabled: boolean;
  customHomeLogoUrl: string | null;
  customHomeLogoSize: number;
  customBoardLogoEnabled: boolean;
  customBoardLogoUrl: string | null;
  customBoardLogoSize: number;
  customGlobalAppNameEnabled: boolean;
  customGlobalAppName: string | null;
}

export function AppBrandingSettings() {
  const { refreshSettings } = useAppSettings();
  const [settings, setSettings] = useState<AppBrandingState>({
    customHomeLogoEnabled: false,
    customHomeLogoUrl: null,
    customHomeLogoSize: 40,
    customBoardLogoEnabled: false,
    customBoardLogoUrl: null,
    customBoardLogoSize: 40,
    customGlobalAppNameEnabled: false,
    customGlobalAppName: null,
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
      const { data, error } = await api
        .from('app_settings')
        .select('customHomeLogoEnabled, customHomeLogoUrl, customHomeLogoSize, customBoardLogoEnabled, customBoardLogoUrl, customBoardLogoSize, customGlobalAppNameEnabled, customGlobalAppName')
        .eq('id', 'default')
        .single();

      if (error) throw error;
      if (data) {
        const loadedSettings: AppBrandingState = {
          customHomeLogoEnabled: data.data?.customHomeLogoEnabled ?? false,
          customHomeLogoUrl: data.data?.customHomeLogoUrl,
          customHomeLogoSize: data.data?.customHomeLogoSize ?? 40,
          customBoardLogoEnabled: data.data?.customBoardLogoEnabled ?? false,
          customBoardLogoUrl: data.data?.customBoardLogoUrl,
          customBoardLogoSize: data.data?.customBoardLogoSize ?? 40,
          customGlobalAppNameEnabled: data.data?.customGlobalAppNameEnabled ?? false,
          customGlobalAppName: data.data?.customGlobalAppName,
        };
        setSettings(loadedSettings);
        setSavedSettings(loadedSettings);
        setAppNameInput(data.data?.customGlobalAppName || '');
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
      settings.customHomeLogoEnabled !== savedSettings.customHomeLogoEnabled ||
      settings.customHomeLogoSize !== savedSettings.customHomeLogoSize ||
      settings.customBoardLogoEnabled !== savedSettings.customBoardLogoEnabled ||
      settings.customBoardLogoSize !== savedSettings.customBoardLogoSize ||
      settings.customGlobalAppNameEnabled !== savedSettings.customGlobalAppNameEnabled ||
      appNameInput.trim() !== (savedSettings.customGlobalAppName || '')
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const updates = {
        customHomeLogoEnabled: settings.customHomeLogoEnabled,
        customHomeLogoSize: settings.customHomeLogoSize,
        customBoardLogoEnabled: settings.customBoardLogoEnabled,
        customBoardLogoSize: settings.customBoardLogoSize,
        customGlobalAppNameEnabled: settings.customGlobalAppNameEnabled,
        customGlobalAppName: appNameInput.trim() || null,
      };

      const { error } = await api
        .from('app_settings')
        .update(updates)
        .eq('id', 'default');

      if (error) throw error;

      const newSettings = { ...settings, customGlobalAppName: appNameInput.trim() || null };
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
      const urlKey = type === 'home' ? 'customHomeLogoUrl' : 'customBoardLogoUrl';
      const currentUrl = settings[urlKey];

      if (currentUrl) {
        const oldPath = currentUrl.split('/branding/')[1];
        if (oldPath) await api.storage.from('branding').remove([oldPath]);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await api.storage.from('branding').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = api.storage.from('branding').getPublicUrl(fileName);
      const { error } = await api.from('app_settings').update({ [urlKey]: urlData.publicUrl }).eq('id', 'default');
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
    const urlKey = type === 'home' ? 'customHomeLogoUrl' : 'customBoardLogoUrl';
    const enabledKey = type === 'home' ? 'customHomeLogoEnabled' : 'customBoardLogoEnabled';
    const currentUrl = settings[urlKey];

    if (!currentUrl) return;
    setSaving(true);
    try {
      const path = currentUrl.split('/branding/')[1];
      if (path) await api.storage.from('branding').remove([path]);
      const { error } = await api.from('app_settings').update({ [urlKey]: null, [enabledKey]: false }).eq('id', 'default');
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
                checked={settings.customGlobalAppNameEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, customGlobalAppNameEnabled: checked }))}
              />
            </div>
            {settings.customGlobalAppNameEnabled && (
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
                  {settings.customGlobalAppNameEnabled && appNameInput.trim() ? appNameInput.trim() : 'KanBoard'}
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
                checked={settings.customHomeLogoEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, customHomeLogoEnabled: checked }))}
                disabled={!settings.customHomeLogoUrl}
              />
            </div>

            <div className="space-y-2">
              <Label>Logo Image</Label>
              <div className="flex items-center gap-3">
                {settings.customHomeLogoUrl ? (
                  <div className="relative w-16 h-16 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    <img src={settings.customHomeLogoUrl} alt="Home logo" className="max-w-full max-h-full object-contain" />
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

            {settings.customHomeLogoUrl && (
              <div className="space-y-2">
                <Label>Logo Size: {settings.customHomeLogoSize}px</Label>
                <Slider
                  value={[settings.customHomeLogoSize]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, customHomeLogoSize: value }))}
                  min={10}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
            )}

            {settings.customHomeLogoUrl && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                <div className="flex items-center gap-2 bg-card p-2 rounded border">
                  <img
                    src={settings.customHomeLogoUrl}
                    alt="Home logo preview"
                    style={{ width: settings.customHomeLogoSize, height: settings.customHomeLogoSize }}
                    className="object-contain"
                  />
                  <span className="text-xl font-bold">
                    {settings.customGlobalAppNameEnabled && appNameInput.trim() ? appNameInput.trim() : 'KanBoard'}
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
                checked={settings.customBoardLogoEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, customBoardLogoEnabled: checked }))}
                disabled={!settings.customBoardLogoUrl}
              />
            </div>

            <div className="space-y-2">
              <Label>Logo Image</Label>
              <div className="flex items-center gap-3">
                {settings.customBoardLogoUrl ? (
                  <div className="relative w-16 h-16 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    <img src={settings.customBoardLogoUrl} alt="Board logo" className="max-w-full max-h-full object-contain" />
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

            {settings.customBoardLogoUrl && (
              <div className="space-y-2">
                <Label>Logo Size: {settings.customBoardLogoSize}px</Label>
                <Slider
                  value={[settings.customBoardLogoSize]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, customBoardLogoSize: value }))}
                  min={10}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
            )}

            {settings.customBoardLogoUrl && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                <div className="flex items-center gap-2 bg-card p-2 rounded border">
                  <img
                    src={settings.customBoardLogoUrl}
                    alt="Board logo preview"
                    style={{ width: settings.customBoardLogoSize, height: settings.customBoardLogoSize }}
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
