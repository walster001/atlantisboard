import { useState, useEffect, useRef } from 'react';
import { api } from '@/integrations/api/client';
import { uploadFile, deleteFile, extractStoragePathFromUrl } from '@/lib/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';

type LogoSize = 'small' | 'medium' | 'large';
type BackgroundType = 'color' | 'image';

interface AppSettings {
  customLoginLogoEnabled: boolean;
  customLoginLogoUrl: string | null;
  customLoginLogoSize: LogoSize;
  customAppNameEnabled: boolean;
  customAppName: string | null;
  customAppNameSize: number;
  customAppNameColor: string;
  customAppNameFont: string;
  customTaglineEnabled: boolean;
  customTagline: string | null;
  customTaglineSize: number;
  customTaglineColor: string;
  customTaglineFont: string;
  customLoginBackgroundEnabled: boolean;
  customLoginBackgroundType: BackgroundType;
  customLoginBackgroundColor: string;
  customLoginBackgroundImageUrl: string | null;
  customLoginBoxBackgroundColor: string;
  customGoogleButtonBackgroundColor: string;
  customGoogleButtonTextColor: string;
}

interface CustomFont {
  id: string;
  name: string;
  fontUrl: string;
}

const textSizes = Array.from({ length: 72 }, (_, i) => i + 1);

export function BrandingSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    customLoginLogoEnabled: false,
    customLoginLogoUrl: null,
    customLoginLogoSize: 'medium',
    customAppNameEnabled: false,
    customAppName: null,
    customAppNameSize: 24,
    customAppNameColor: '#000000',
    customAppNameFont: 'default',
    customTaglineEnabled: false,
    customTagline: null,
    customTaglineSize: 14,
    customTaglineColor: '#6b7280',
    customTaglineFont: 'default',
    customLoginBackgroundEnabled: false,
    customLoginBackgroundType: 'color',
    customLoginBackgroundColor: '#f3f4f6',
    customLoginBackgroundImageUrl: null,
    customLoginBoxBackgroundColor: '#ffffff',
    customGoogleButtonBackgroundColor: '#ffffff',
    customGoogleButtonTextColor: '#000000',
  });
  const [savedSettings, setSavedSettings] = useState<AppSettings | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingBgImage, setUploadingBgImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appNameInput, setAppNameInput] = useState('');
  const [taglineInput, setTaglineInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
    fetchCustomFonts();
  }, []);

  useEffect(() => {
    customFonts.forEach((font) => {
      const fontId = `custom-font-${font.id}`;
      if (!document.getElementById(fontId)) {
        const style = document.createElement('style');
        style.id = fontId;
        style.textContent = `
          @font-face {
            font-family: '${font.name}';
            src: url('${font.fontUrl}') format('woff2'), url('${font.fontUrl}') format('woff'), url('${font.fontUrl}') format('truetype');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
      }
    });
  }, [customFonts]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await api
        .from('app_settings')
        .select('*')
        .eq('id', 'default')
        .single() as { data: any; error: Error | null };

      if (error) throw error;
      if (data) {
        const loadedSettings: AppSettings = {
          customLoginLogoEnabled: data.customLoginLogoEnabled ?? false,
          customLoginLogoUrl: data.customLoginLogoUrl,
          customLoginLogoSize: (data.customLoginLogoSize as LogoSize) || 'medium',
          customAppNameEnabled: data.customAppNameEnabled ?? false,
          customAppName: data.customAppName,
          customAppNameSize: data.customAppNameSize || 24,
          customAppNameColor: data.customAppNameColor || '#000000',
          customAppNameFont: data.customAppNameFont || 'default',
          customTaglineEnabled: data.customTaglineEnabled ?? false,
          customTagline: data.customTagline,
          customTaglineSize: data.customTaglineSize || 14,
          customTaglineColor: data.customTaglineColor || '#6b7280',
          customTaglineFont: data.customTaglineFont || 'default',
          customLoginBackgroundEnabled: data.customLoginBackgroundEnabled ?? false,
          customLoginBackgroundType: (data.customLoginBackgroundType as BackgroundType) || 'color',
          customLoginBackgroundColor: data.customLoginBackgroundColor || '#f3f4f6',
          customLoginBackgroundImageUrl: data.customLoginBackgroundImageUrl,
          customLoginBoxBackgroundColor: data.customLoginBoxBackgroundColor || '#ffffff',
          customGoogleButtonBackgroundColor: data.customGoogleButtonBackgroundColor || '#ffffff',
          customGoogleButtonTextColor: data.customGoogleButtonTextColor || '#000000',
        };
        setSettings(loadedSettings);
        setSavedSettings(loadedSettings);
        setAppNameInput(data.customAppName || '');
        setTaglineInput(data.customTagline || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomFonts = async () => {
    try {
      const result = await api
        .from('custom_fonts')
        .select('id, name, fontUrl')
        .order('name');
      const { data, error } = result as { data: CustomFont[] | null; error: Error | null };

      if (error) throw error;
      setCustomFonts(data || []);
    } catch (error) {
      console.error('Error fetching fonts:', error);
    }
  };

  const getFontFamily = (fontKey: string) => {
    if (fontKey === 'default') return 'Inter, sans-serif';
    const font = customFonts.find(f => f.id === fontKey);
    return font ? `'${font.name}', sans-serif` : 'Inter, sans-serif';
  };

  const hasUnsavedChanges = () => {
    if (!savedSettings) return false;
    return (
      settings.customLoginLogoEnabled !== savedSettings.customLoginLogoEnabled ||
      settings.customLoginLogoSize !== savedSettings.customLoginLogoSize ||
      settings.customAppNameEnabled !== savedSettings.customAppNameEnabled ||
      appNameInput.trim() !== (savedSettings.customAppName || '') ||
      settings.customAppNameSize !== savedSettings.customAppNameSize ||
      settings.customAppNameColor !== savedSettings.customAppNameColor ||
      settings.customAppNameFont !== savedSettings.customAppNameFont ||
      settings.customTaglineEnabled !== savedSettings.customTaglineEnabled ||
      taglineInput.trim() !== (savedSettings.customTagline || '') ||
      settings.customTaglineSize !== savedSettings.customTaglineSize ||
      settings.customTaglineColor !== savedSettings.customTaglineColor ||
      settings.customTaglineFont !== savedSettings.customTaglineFont ||
      settings.customLoginBackgroundEnabled !== savedSettings.customLoginBackgroundEnabled ||
      settings.customLoginBackgroundType !== savedSettings.customLoginBackgroundType ||
      settings.customLoginBackgroundColor !== savedSettings.customLoginBackgroundColor ||
      settings.customLoginBoxBackgroundColor !== savedSettings.customLoginBoxBackgroundColor ||
      settings.customGoogleButtonBackgroundColor !== savedSettings.customGoogleButtonBackgroundColor ||
      settings.customGoogleButtonTextColor !== savedSettings.customGoogleButtonTextColor
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const updates = {
        customLoginLogoEnabled: settings.customLoginLogoEnabled,
        customLoginLogoSize: settings.customLoginLogoSize,
        customAppNameEnabled: settings.customAppNameEnabled,
        customAppName: appNameInput.trim() || null,
        customAppNameSize: settings.customAppNameSize,
        customAppNameColor: settings.customAppNameColor,
        customAppNameFont: settings.customAppNameFont,
        customTaglineEnabled: settings.customTaglineEnabled,
        customTagline: taglineInput.trim() || null,
        customTaglineSize: settings.customTaglineSize,
        customTaglineColor: settings.customTaglineColor,
        customTaglineFont: settings.customTaglineFont,
        customLoginBackgroundEnabled: settings.customLoginBackgroundEnabled,
        customLoginBackgroundType: settings.customLoginBackgroundType,
        customLoginBackgroundColor: settings.customLoginBackgroundColor,
        customLoginBoxBackgroundColor: settings.customLoginBoxBackgroundColor,
        customGoogleButtonBackgroundColor: settings.customGoogleButtonBackgroundColor,
        customGoogleButtonTextColor: settings.customGoogleButtonTextColor,
      };

      const { error } = await api
        .from('app_settings')
        .eq('id', 'default')
        .update(updates);

      if (error) throw error;

      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);
      setSavedSettings(newSettings);
      
      toast({
        title: 'Settings saved',
        description: 'Branding settings have been updated.',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
      if (settings.customLoginLogoUrl) {
        const oldPath = extractStoragePathFromUrl(settings.customLoginLogoUrl, 'branding');
        if (oldPath) {
          const deleteResult = await deleteFile('branding', oldPath);
          if (deleteResult.error) {
            console.error('Failed to delete old logo:', deleteResult.error);
          }
        }
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `login-logo-${Date.now()}.${fileExt}`;
      
      const uploadResult = await uploadFile('branding', fileName, file);
      if (uploadResult.error || !uploadResult.data) {
        throw uploadResult.error || new Error('Upload failed: No data returned');
      }

      // Use publicUrl from upload response
      const publicUrl = uploadResult.data.publicUrl;
      const { error } = await api.from('app_settings').eq('id', 'default').update({ customLoginLogoUrl: publicUrl });
      if (error) throw error;

      setSettings(prev => ({ ...prev, customLoginLogoUrl: publicUrl }));
      setSavedSettings(prev => prev ? { ...prev, customLoginLogoUrl: publicUrl } : prev);
      toast({ title: 'Logo uploaded', description: 'Your custom login logo has been uploaded.' });
    } catch (error: unknown) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!settings.customLoginLogoUrl) return;
    setSaving(true);
    try {
      const path = extractStoragePathFromUrl(settings.customLoginLogoUrl, 'branding');
      if (!path) return;
      const deleteResult = await deleteFile('branding', path);
      if (deleteResult.error) {
        console.error('Failed to delete logo:', deleteResult.error);
      }
      const { error } = await api.from('app_settings').eq('id', 'default').update({ customLoginLogoUrl: null, customLoginLogoEnabled: false });
      if (error) throw error;
      setSettings(prev => ({ ...prev, customLoginLogoUrl: null, customLoginLogoEnabled: false }));
      setSavedSettings(prev => prev ? { ...prev, customLoginLogoUrl: null, customLoginLogoEnabled: false } : prev);
    } catch (error: unknown) {
      toast({ title: 'Error removing logo', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleBgImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image smaller than 5MB.', variant: 'destructive' });
      return;
    }

    setUploadingBgImage(true);
    try {
      if (settings.customLoginBackgroundImageUrl) {
        const oldPath = extractStoragePathFromUrl(settings.customLoginBackgroundImageUrl, 'branding');
        if (oldPath) {
          const deleteResult = await deleteFile('branding', oldPath);
          if (deleteResult.error) {
            console.error('Failed to delete old background:', deleteResult.error);
          }
        }
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `login-bg-${Date.now()}.${fileExt}`;
      
      const uploadResult = await uploadFile('branding', fileName, file);
      if (uploadResult.error || !uploadResult.data) {
        throw uploadResult.error || new Error('Upload failed: No data returned');
      }

      // Use publicUrl from upload response
      const publicUrl = uploadResult.data.publicUrl;
      const { error } = await api.from('app_settings').eq('id', 'default').update({ customLoginBackgroundImageUrl: publicUrl });
      if (error) throw error;

      setSettings(prev => ({ ...prev, customLoginBackgroundImageUrl: publicUrl }));
      setSavedSettings(prev => prev ? { ...prev, customLoginBackgroundImageUrl: publicUrl } : prev);
      toast({ title: 'Background image uploaded', description: 'Your custom background image has been uploaded.' });
    } catch (error: unknown) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingBgImage(false);
      if (bgImageInputRef.current) bgImageInputRef.current.value = '';
    }
  };

  const handleRemoveBgImage = async () => {
    if (!settings.customLoginBackgroundImageUrl) return;
    setSaving(true);
    try {
      const path = extractStoragePathFromUrl(settings.customLoginBackgroundImageUrl, 'branding');
      if (!path) return;
      const deleteResult = await deleteFile('branding', path);
      if (deleteResult.error) {
        console.error('Failed to delete background:', deleteResult.error);
      }
      const { error } = await api.from('app_settings').eq('id', 'default').update({ customLoginBackgroundImageUrl: null });
      if (error) throw error;
      setSettings(prev => ({ ...prev, customLoginBackgroundImageUrl: null }));
      setSavedSettings(prev => prev ? { ...prev, customLoginBackgroundImageUrl: null } : prev);
    } catch (error: unknown) {
      toast({ title: 'Error removing background', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const getPreviewBackgroundStyles = () => {
    if (!settings.customLoginBackgroundEnabled) {
      return { className: 'bg-gradient-to-br from-muted via-background to-muted' };
    }
    if (settings.customLoginBackgroundType === 'image' && settings.customLoginBackgroundImageUrl) {
      return {
        style: {
          backgroundImage: `url(${settings.customLoginBackgroundImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      };
    }
    return { style: { backgroundColor: settings.customLoginBackgroundColor } };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const previewBgStyles = getPreviewBackgroundStyles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Branding</h2>
          <p className="text-muted-foreground">Customize the appearance of your application.</p>
        </div>
        <Button onClick={handleSaveAll} disabled={saving || !hasUnsavedChanges()}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Settings Column */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Custom Login Background */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Custom Login Background</CardTitle>
              <CardDescription>Customize the background of the login page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="bg-toggle" className="font-medium">Enable custom background</Label>
                <Switch
                  id="bg-toggle"
                  checked={settings.customLoginBackgroundEnabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, customLoginBackgroundEnabled: enabled }))}
                  disabled={saving}
                />
              </div>

              {settings.customLoginBackgroundEnabled && (
                <>
                  <div className="border-t pt-4">
                    <Label className="text-sm font-medium mb-2 block">Background Type</Label>
                    <Select
                      value={settings.customLoginBackgroundType}
                      onValueChange={(value) => setSettings(prev => ({ ...prev, customLoginBackgroundType: value as BackgroundType }))}
                      disabled={saving}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="color">Solid Color</SelectItem>
                        <SelectItem value="image">Background Image</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {settings.customLoginBackgroundType === 'color' && (
                    <div className="border-t pt-4">
                      <Label className="text-sm font-medium mb-2 block">Background Color</Label>
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" className="shrink-0">
                              <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.customLoginBackgroundColor }} />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-3" align="start">
                            <div className="space-y-2">
                              <input type="color" value={settings.customLoginBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customLoginBackgroundColor: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                              <Input value={settings.customLoginBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customLoginBackgroundColor: e.target.value }))} className="font-mono text-sm" />
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Input value={settings.customLoginBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customLoginBackgroundColor: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </div>
                  )}

                  {settings.customLoginBackgroundType === 'image' && (
                    <div className="border-t pt-4">
                      <Label className="text-sm font-medium mb-2 block">Background Image</Label>
                      {settings.customLoginBackgroundImageUrl ? (
                        <div className="space-y-2">
                          <div className="relative inline-block">
                            <img src={settings.customLoginBackgroundImageUrl} alt="Background preview" className="max-h-24 max-w-full rounded-md border object-cover" />
                            <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={handleRemoveBgImage} disabled={saving}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => bgImageInputRef.current?.click()} disabled={uploadingBgImage}>
                            {uploadingBgImage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                            Replace
                          </Button>
                        </div>
                      ) : (
                        <div onClick={() => bgImageInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
                          {uploadingBgImage ? <Loader2 className="h-6 w-6 mx-auto mb-1 animate-spin text-muted-foreground" /> : <ImageIcon className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />}
                          <p className="text-xs text-muted-foreground">{uploadingBgImage ? 'Uploading...' : 'Click to upload (max 5MB)'}</p>
                        </div>
                      )}
                      <input ref={bgImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageSelect} />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Login Box Styling */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Login Box & Button Styling</CardTitle>
              <CardDescription>Customize the login card and Google button.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Login Box Background</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.customLoginBoxBackgroundColor }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-2">
                        <input type="color" value={settings.customLoginBoxBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customLoginBoxBackgroundColor: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                        <Input value={settings.customLoginBoxBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customLoginBoxBackgroundColor: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input value={settings.customLoginBoxBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customLoginBoxBackgroundColor: e.target.value }))} className="font-mono text-sm" />
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Google Button Background</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.customGoogleButtonBackgroundColor }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-2">
                        <input type="color" value={settings.customGoogleButtonBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customGoogleButtonBackgroundColor: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                        <Input value={settings.customGoogleButtonBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customGoogleButtonBackgroundColor: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input value={settings.customGoogleButtonBackgroundColor} onChange={(e) => setSettings(prev => ({ ...prev, customGoogleButtonBackgroundColor: e.target.value }))} className="font-mono text-sm" />
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Google Button Text Color</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.customGoogleButtonTextColor }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-2">
                        <input type="color" value={settings.customGoogleButtonTextColor} onChange={(e) => setSettings(prev => ({ ...prev, customGoogleButtonTextColor: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                        <Input value={settings.customGoogleButtonTextColor} onChange={(e) => setSettings(prev => ({ ...prev, customGoogleButtonTextColor: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input value={settings.customGoogleButtonTextColor} onChange={(e) => setSettings(prev => ({ ...prev, customGoogleButtonTextColor: e.target.value }))} className="font-mono text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Custom Login Logo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Custom Login Logo</CardTitle>
              <CardDescription>Display a custom logo on the sign-in screen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="logo-toggle" className="font-medium">Enable custom logo</Label>
                <Switch
                  id="logo-toggle"
                  checked={settings.customLoginLogoEnabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, customLoginLogoEnabled: enabled }))}
                  disabled={saving || !settings.customLoginLogoUrl}
                />
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Logo Image</Label>
                {settings.customLoginLogoUrl ? (
                  <div className="space-y-2">
                    <div className="relative inline-block">
                      <img src={settings.customLoginLogoUrl} alt="Login logo preview" className="max-h-20 max-w-full rounded-md border bg-muted object-contain p-2" />
                      <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={handleRemoveLogo} disabled={saving}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                      Replace
                    </Button>
                  </div>
                ) : (
                  <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
                    {uploading ? <Loader2 className="h-6 w-6 mx-auto mb-1 animate-spin text-muted-foreground" /> : <ImageIcon className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />}
                    <p className="text-xs text-muted-foreground">{uploading ? 'Uploading...' : 'Click to upload (max 2MB)'}</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </div>

              {settings.customLoginLogoUrl && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-2 block">Logo Size</Label>
                  <Select value={settings.customLoginLogoSize} onValueChange={(value) => setSettings(prev => ({ ...prev, customLoginLogoSize: value as LogoSize }))} disabled={saving}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (100px)</SelectItem>
                      <SelectItem value="medium">Medium (200px)</SelectItem>
                      <SelectItem value="large">Large (300px)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom App Name */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Custom App Name</CardTitle>
              <CardDescription>Display a custom application name on the sign-in screen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="appname-toggle" className="font-medium">Enable custom app name</Label>
                <Switch
                  id="appname-toggle"
                  checked={settings.customAppNameEnabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, customAppNameEnabled: enabled }))}
                  disabled={saving || !appNameInput.trim()}
                />
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Application Name</Label>
                <Input placeholder="Enter your application name" value={appNameInput} onChange={(e) => setAppNameInput(e.target.value)} />
              </div>

              {appNameInput.trim() && (
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Font</Label>
                    <Select value={settings.customAppNameFont} onValueChange={(value) => setSettings(prev => ({ ...prev, customAppNameFont: value }))} disabled={saving}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default (Inter)</SelectItem>
                        {customFonts.map((font) => <SelectItem key={font.id} value={font.id}>{font.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-2 block">Size & Color</Label>
                    <div className="flex items-center gap-2">
                      <Select value={settings.customAppNameSize.toString()} onValueChange={(value) => setSettings(prev => ({ ...prev, customAppNameSize: parseInt(value) }))} disabled={saving}>
                        <SelectTrigger className="w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <ScrollArea className="h-[200px]">
                            {textSizes.map((size) => <SelectItem key={size} value={size.toString()}>{size}px</SelectItem>)}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0">
                            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.customAppNameColor }} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="space-y-2">
                            <input type="color" value={settings.customAppNameColor} onChange={(e) => setSettings(prev => ({ ...prev, customAppNameColor: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                            <Input value={settings.customAppNameColor} onChange={(e) => setSettings(prev => ({ ...prev, customAppNameColor: e.target.value }))} className="font-mono text-sm" />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom Tagline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Custom Tagline</CardTitle>
              <CardDescription>Display a custom tagline below the app name.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="tagline-toggle" className="font-medium">Enable custom tagline</Label>
                <Switch
                  id="tagline-toggle"
                  checked={settings.customTaglineEnabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, customTaglineEnabled: enabled }))}
                  disabled={saving || !taglineInput.trim()}
                />
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Tagline Text</Label>
                <Input placeholder="Enter your tagline" value={taglineInput} onChange={(e) => setTaglineInput(e.target.value)} />
              </div>

              {taglineInput.trim() && (
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Font</Label>
                    <Select value={settings.customTaglineFont} onValueChange={(value) => setSettings(prev => ({ ...prev, customTaglineFont: value }))} disabled={saving}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default (Inter)</SelectItem>
                        {customFonts.map((font) => <SelectItem key={font.id} value={font.id}>{font.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-2 block">Size & Color</Label>
                    <div className="flex items-center gap-2">
                      <Select value={settings.customTaglineSize.toString()} onValueChange={(value) => setSettings(prev => ({ ...prev, customTaglineSize: parseInt(value) }))} disabled={saving}>
                        <SelectTrigger className="w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <ScrollArea className="h-[200px]">
                            {textSizes.map((size) => <SelectItem key={size} value={size.toString()}>{size}px</SelectItem>)}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0">
                            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.customTaglineColor }} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="space-y-2">
                            <input type="color" value={settings.customTaglineColor} onChange={(e) => setSettings(prev => ({ ...prev, customTaglineColor: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                            <Input value={settings.customTaglineColor} onChange={(e) => setSettings(prev => ({ ...prev, customTaglineColor: e.target.value }))} className="font-mono text-sm" />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview Column - Sticky on desktop */}
        <div className="xl:w-[400px] xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <div 
                  className={`p-4 flex items-center justify-center min-h-[400px] ${previewBgStyles.className || ''}`}
                  style={previewBgStyles.style}
                >
                  <div 
                    className="w-full max-w-[280px] rounded-lg shadow-lg"
                    style={{ backgroundColor: settings.customLoginBoxBackgroundColor }}
                  >
                    <div className="p-4 text-center space-y-3">
                      {settings.customLoginLogoEnabled && settings.customLoginLogoUrl && (
                        <div className="flex justify-center">
                          <img
                            src={settings.customLoginLogoUrl}
                            alt="Logo Preview"
                            className={`object-contain ${
                              settings.customLoginLogoSize === 'small' ? 'w-[50px] h-[50px]' 
                              : settings.customLoginLogoSize === 'large' ? 'w-[120px] h-[120px]' 
                              : 'w-[80px] h-[80px]'
                            }`}
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <h1 
                          className="font-bold text-center truncate" 
                          style={{ 
                            fontSize: `${Math.min(settings.customAppNameEnabled && appNameInput.trim() ? settings.customAppNameSize : 24, 24)}px`, 
                            color: settings.customAppNameEnabled && appNameInput.trim() ? settings.customAppNameColor : '#000000',
                            fontFamily: settings.customAppNameEnabled && appNameInput.trim() ? getFontFamily(settings.customAppNameFont) : 'Inter, sans-serif',
                          }}
                        >
                          {settings.customAppNameEnabled && appNameInput.trim() ? appNameInput : 'KanBoard'}
                        </h1>
                        <p 
                          className="text-center leading-relaxed line-clamp-2" 
                          style={{ 
                            fontSize: `${Math.min(settings.customTaglineEnabled && taglineInput.trim() ? settings.customTaglineSize : 14, 14)}px`, 
                            color: settings.customTaglineEnabled && taglineInput.trim() ? settings.customTaglineColor : '#6b7280',
                            fontFamily: settings.customTaglineEnabled && taglineInput.trim() ? getFontFamily(settings.customTaglineFont) : 'Inter, sans-serif',
                          }}
                        >
                          {settings.customTaglineEnabled && taglineInput.trim() ? taglineInput : 'Sign in to manage your boards'}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 pt-0">
                      <button 
                        className="w-full h-9 text-sm border rounded-md flex items-center justify-center gap-2"
                        style={{
                          backgroundColor: settings.customGoogleButtonBackgroundColor,
                          color: settings.customGoogleButtonTextColor,
                        }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Continue with Google
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}