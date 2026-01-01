import { useState, useEffect, useRef } from 'react';
import { api } from '@/integrations/api/client';
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
  custom_login_logo_enabled: boolean;
  custom_login_logo_url: string | null;
  custom_login_logo_size: LogoSize;
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
  custom_login_background_type: BackgroundType;
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

const textSizes = Array.from({ length: 72 }, (_, i) => i + 1);

export function BrandingSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    custom_login_logo_enabled: false,
    custom_login_logo_url: null,
    custom_login_logo_size: 'medium',
    custom_app_name_enabled: false,
    custom_app_name: null,
    custom_app_name_size: 24,
    custom_app_name_color: '#000000',
    custom_app_name_font: 'default',
    custom_tagline_enabled: false,
    custom_tagline: null,
    custom_tagline_size: 14,
    custom_tagline_color: '#6b7280',
    custom_tagline_font: 'default',
    custom_login_background_enabled: false,
    custom_login_background_type: 'color',
    custom_login_background_color: '#f3f4f6',
    custom_login_background_image_url: null,
    custom_login_box_background_color: '#ffffff',
    custom_google_button_background_color: '#ffffff',
    custom_google_button_text_color: '#000000',
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
            src: url('${font.font_url}') format('woff2'), url('${font.font_url}') format('woff'), url('${font.font_url}') format('truetype');
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
        .single();

      if (error) throw error;
      if (data) {
        const loadedSettings: AppSettings = {
          custom_login_logo_enabled: data.custom_login_logo_enabled,
          custom_login_logo_url: data.custom_login_logo_url,
          custom_login_logo_size: (data.custom_login_logo_size as LogoSize) || 'medium',
          custom_app_name_enabled: data.custom_app_name_enabled,
          custom_app_name: data.custom_app_name,
          custom_app_name_size: data.custom_app_name_size || 24,
          custom_app_name_color: data.custom_app_name_color || '#000000',
          custom_app_name_font: data.custom_app_name_font || 'default',
          custom_tagline_enabled: data.custom_tagline_enabled,
          custom_tagline: data.custom_tagline,
          custom_tagline_size: data.custom_tagline_size || 14,
          custom_tagline_color: data.custom_tagline_color || '#6b7280',
          custom_tagline_font: data.custom_tagline_font || 'default',
          custom_login_background_enabled: data.custom_login_background_enabled ?? false,
          custom_login_background_type: (data.custom_login_background_type as BackgroundType) || 'color',
          custom_login_background_color: data.custom_login_background_color || '#f3f4f6',
          custom_login_background_image_url: data.custom_login_background_image_url,
          custom_login_box_background_color: data.custom_login_box_background_color || '#ffffff',
          custom_google_button_background_color: data.custom_google_button_background_color || '#ffffff',
          custom_google_button_text_color: data.custom_google_button_text_color || '#000000',
        };
        setSettings(loadedSettings);
        setSavedSettings(loadedSettings);
        setAppNameInput(data.custom_app_name || '');
        setTaglineInput(data.custom_tagline || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomFonts = async () => {
    try {
      const { data, error } = await api
        .from('custom_fonts')
        .select('id, name, font_url')
        .order('name');

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
      settings.custom_login_logo_enabled !== savedSettings.custom_login_logo_enabled ||
      settings.custom_login_logo_size !== savedSettings.custom_login_logo_size ||
      settings.custom_app_name_enabled !== savedSettings.custom_app_name_enabled ||
      appNameInput.trim() !== (savedSettings.custom_app_name || '') ||
      settings.custom_app_name_size !== savedSettings.custom_app_name_size ||
      settings.custom_app_name_color !== savedSettings.custom_app_name_color ||
      settings.custom_app_name_font !== savedSettings.custom_app_name_font ||
      settings.custom_tagline_enabled !== savedSettings.custom_tagline_enabled ||
      taglineInput.trim() !== (savedSettings.custom_tagline || '') ||
      settings.custom_tagline_size !== savedSettings.custom_tagline_size ||
      settings.custom_tagline_color !== savedSettings.custom_tagline_color ||
      settings.custom_tagline_font !== savedSettings.custom_tagline_font ||
      settings.custom_login_background_enabled !== savedSettings.custom_login_background_enabled ||
      settings.custom_login_background_type !== savedSettings.custom_login_background_type ||
      settings.custom_login_background_color !== savedSettings.custom_login_background_color ||
      settings.custom_login_box_background_color !== savedSettings.custom_login_box_background_color ||
      settings.custom_google_button_background_color !== savedSettings.custom_google_button_background_color ||
      settings.custom_google_button_text_color !== savedSettings.custom_google_button_text_color
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const updates = {
        custom_login_logo_enabled: settings.custom_login_logo_enabled,
        custom_login_logo_size: settings.custom_login_logo_size,
        custom_app_name_enabled: settings.custom_app_name_enabled,
        custom_app_name: appNameInput.trim() || null,
        custom_app_name_size: settings.custom_app_name_size,
        custom_app_name_color: settings.custom_app_name_color,
        custom_app_name_font: settings.custom_app_name_font,
        custom_tagline_enabled: settings.custom_tagline_enabled,
        custom_tagline: taglineInput.trim() || null,
        custom_tagline_size: settings.custom_tagline_size,
        custom_tagline_color: settings.custom_tagline_color,
        custom_tagline_font: settings.custom_tagline_font,
        custom_login_background_enabled: settings.custom_login_background_enabled,
        custom_login_background_type: settings.custom_login_background_type,
        custom_login_background_color: settings.custom_login_background_color,
        custom_login_box_background_color: settings.custom_login_box_background_color,
        custom_google_button_background_color: settings.custom_google_button_background_color,
        custom_google_button_text_color: settings.custom_google_button_text_color,
      };

      const { error } = await api
        .from('app_settings')
        .update(updates)
        .eq('id', 'default');

      if (error) throw error;

      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);
      setSavedSettings(newSettings);
      
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
      if (settings.custom_login_logo_url) {
        const oldPath = settings.custom_login_logo_url.split('/branding/')[1];
        if (oldPath) await api.storage.from('branding').remove([oldPath]);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `login-logo-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await api.storage.from('branding').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = api.storage.from('branding').getPublicUrl(fileName);
      const { error } = await api.from('app_settings').update({ custom_login_logo_url: urlData.publicUrl }).eq('id', 'default');
      if (error) throw error;

      setSettings(prev => ({ ...prev, custom_login_logo_url: urlData.publicUrl }));
      setSavedSettings(prev => prev ? { ...prev, custom_login_logo_url: urlData.publicUrl } : prev);
      toast({ title: 'Logo uploaded', description: 'Your custom login logo has been uploaded.' });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!settings.custom_login_logo_url) return;
    setSaving(true);
    try {
      const path = settings.custom_login_logo_url.split('/branding/')[1];
      if (path) await api.storage.from('branding').remove([path]);
      const { error } = await api.from('app_settings').update({ custom_login_logo_url: null, custom_login_logo_enabled: false }).eq('id', 'default');
      if (error) throw error;
      setSettings(prev => ({ ...prev, custom_login_logo_url: null, custom_login_logo_enabled: false }));
      setSavedSettings(prev => prev ? { ...prev, custom_login_logo_url: null, custom_login_logo_enabled: false } : prev);
    } catch (error: any) {
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
      if (settings.custom_login_background_image_url) {
        const oldPath = settings.custom_login_background_image_url.split('/branding/')[1];
        if (oldPath) await api.storage.from('branding').remove([oldPath]);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `login-bg-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await api.storage.from('branding').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = api.storage.from('branding').getPublicUrl(fileName);
      const { error } = await api.from('app_settings').update({ custom_login_background_image_url: urlData.publicUrl }).eq('id', 'default');
      if (error) throw error;

      setSettings(prev => ({ ...prev, custom_login_background_image_url: urlData.publicUrl }));
      setSavedSettings(prev => prev ? { ...prev, custom_login_background_image_url: urlData.publicUrl } : prev);
      toast({ title: 'Background image uploaded', description: 'Your custom background image has been uploaded.' });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingBgImage(false);
      if (bgImageInputRef.current) bgImageInputRef.current.value = '';
    }
  };

  const handleRemoveBgImage = async () => {
    if (!settings.custom_login_background_image_url) return;
    setSaving(true);
    try {
      const path = settings.custom_login_background_image_url.split('/branding/')[1];
      if (path) await api.storage.from('branding').remove([path]);
      const { error } = await api.from('app_settings').update({ custom_login_background_image_url: null }).eq('id', 'default');
      if (error) throw error;
      setSettings(prev => ({ ...prev, custom_login_background_image_url: null }));
      setSavedSettings(prev => prev ? { ...prev, custom_login_background_image_url: null } : prev);
    } catch (error: any) {
      toast({ title: 'Error removing background', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const getPreviewBackgroundStyles = () => {
    if (!settings.custom_login_background_enabled) {
      return { className: 'bg-gradient-to-br from-muted via-background to-muted' };
    }
    if (settings.custom_login_background_type === 'image' && settings.custom_login_background_image_url) {
      return {
        style: {
          backgroundImage: `url(${settings.custom_login_background_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      };
    }
    return { style: { backgroundColor: settings.custom_login_background_color } };
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
                  checked={settings.custom_login_background_enabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, custom_login_background_enabled: enabled }))}
                  disabled={saving}
                />
              </div>

              {settings.custom_login_background_enabled && (
                <>
                  <div className="border-t pt-4">
                    <Label className="text-sm font-medium mb-2 block">Background Type</Label>
                    <Select
                      value={settings.custom_login_background_type}
                      onValueChange={(value) => setSettings(prev => ({ ...prev, custom_login_background_type: value as BackgroundType }))}
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

                  {settings.custom_login_background_type === 'color' && (
                    <div className="border-t pt-4">
                      <Label className="text-sm font-medium mb-2 block">Background Color</Label>
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" className="shrink-0">
                              <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.custom_login_background_color }} />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-3" align="start">
                            <div className="space-y-2">
                              <input type="color" value={settings.custom_login_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_login_background_color: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                              <Input value={settings.custom_login_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_login_background_color: e.target.value }))} className="font-mono text-sm" />
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Input value={settings.custom_login_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_login_background_color: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </div>
                  )}

                  {settings.custom_login_background_type === 'image' && (
                    <div className="border-t pt-4">
                      <Label className="text-sm font-medium mb-2 block">Background Image</Label>
                      {settings.custom_login_background_image_url ? (
                        <div className="space-y-2">
                          <div className="relative inline-block">
                            <img src={settings.custom_login_background_image_url} alt="Background preview" className="max-h-24 max-w-full rounded-md border object-cover" />
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
                        <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.custom_login_box_background_color }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-2">
                        <input type="color" value={settings.custom_login_box_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_login_box_background_color: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                        <Input value={settings.custom_login_box_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_login_box_background_color: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input value={settings.custom_login_box_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_login_box_background_color: e.target.value }))} className="font-mono text-sm" />
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Google Button Background</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.custom_google_button_background_color }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-2">
                        <input type="color" value={settings.custom_google_button_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_google_button_background_color: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                        <Input value={settings.custom_google_button_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_google_button_background_color: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input value={settings.custom_google_button_background_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_google_button_background_color: e.target.value }))} className="font-mono text-sm" />
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Google Button Text Color</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.custom_google_button_text_color }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-2">
                        <input type="color" value={settings.custom_google_button_text_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_google_button_text_color: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                        <Input value={settings.custom_google_button_text_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_google_button_text_color: e.target.value }))} className="font-mono text-sm" />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input value={settings.custom_google_button_text_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_google_button_text_color: e.target.value }))} className="font-mono text-sm" />
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
                  checked={settings.custom_login_logo_enabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, custom_login_logo_enabled: enabled }))}
                  disabled={saving || !settings.custom_login_logo_url}
                />
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Logo Image</Label>
                {settings.custom_login_logo_url ? (
                  <div className="space-y-2">
                    <div className="relative inline-block">
                      <img src={settings.custom_login_logo_url} alt="Login logo preview" className="max-h-20 max-w-full rounded-md border bg-muted object-contain p-2" />
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

              {settings.custom_login_logo_url && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-2 block">Logo Size</Label>
                  <Select value={settings.custom_login_logo_size} onValueChange={(value) => setSettings(prev => ({ ...prev, custom_login_logo_size: value as LogoSize }))} disabled={saving}>
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
                  checked={settings.custom_app_name_enabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, custom_app_name_enabled: enabled }))}
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
                    <Select value={settings.custom_app_name_font} onValueChange={(value) => setSettings(prev => ({ ...prev, custom_app_name_font: value }))} disabled={saving}>
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
                      <Select value={settings.custom_app_name_size.toString()} onValueChange={(value) => setSettings(prev => ({ ...prev, custom_app_name_size: parseInt(value) }))} disabled={saving}>
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
                            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.custom_app_name_color }} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="space-y-2">
                            <input type="color" value={settings.custom_app_name_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_app_name_color: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                            <Input value={settings.custom_app_name_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_app_name_color: e.target.value }))} className="font-mono text-sm" />
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
                  checked={settings.custom_tagline_enabled}
                  onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, custom_tagline_enabled: enabled }))}
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
                    <Select value={settings.custom_tagline_font} onValueChange={(value) => setSettings(prev => ({ ...prev, custom_tagline_font: value }))} disabled={saving}>
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
                      <Select value={settings.custom_tagline_size.toString()} onValueChange={(value) => setSettings(prev => ({ ...prev, custom_tagline_size: parseInt(value) }))} disabled={saving}>
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
                            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: settings.custom_tagline_color }} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="space-y-2">
                            <input type="color" value={settings.custom_tagline_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_tagline_color: e.target.value }))} className="w-full h-8 cursor-pointer rounded border-0" />
                            <Input value={settings.custom_tagline_color} onChange={(e) => setSettings(prev => ({ ...prev, custom_tagline_color: e.target.value }))} className="font-mono text-sm" />
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
                    style={{ backgroundColor: settings.custom_login_box_background_color }}
                  >
                    <div className="p-4 text-center space-y-3">
                      {settings.custom_login_logo_enabled && settings.custom_login_logo_url && (
                        <div className="flex justify-center">
                          <img
                            src={settings.custom_login_logo_url}
                            alt="Logo Preview"
                            className={`object-contain ${
                              settings.custom_login_logo_size === 'small' ? 'w-[50px] h-[50px]' 
                              : settings.custom_login_logo_size === 'large' ? 'w-[120px] h-[120px]' 
                              : 'w-[80px] h-[80px]'
                            }`}
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <h1 
                          className="font-bold text-center truncate" 
                          style={{ 
                            fontSize: `${Math.min(settings.custom_app_name_enabled && appNameInput.trim() ? settings.custom_app_name_size : 24, 24)}px`, 
                            color: settings.custom_app_name_enabled && appNameInput.trim() ? settings.custom_app_name_color : '#000000',
                            fontFamily: settings.custom_app_name_enabled && appNameInput.trim() ? getFontFamily(settings.custom_app_name_font) : 'Inter, sans-serif',
                          }}
                        >
                          {settings.custom_app_name_enabled && appNameInput.trim() ? appNameInput : 'KanBoard'}
                        </h1>
                        <p 
                          className="text-center leading-relaxed line-clamp-2" 
                          style={{ 
                            fontSize: `${Math.min(settings.custom_tagline_enabled && taglineInput.trim() ? settings.custom_tagline_size : 14, 14)}px`, 
                            color: settings.custom_tagline_enabled && taglineInput.trim() ? settings.custom_tagline_color : '#6b7280',
                            fontFamily: settings.custom_tagline_enabled && taglineInput.trim() ? getFontFamily(settings.custom_tagline_font) : 'Inter, sans-serif',
                          }}
                        >
                          {settings.custom_tagline_enabled && taglineInput.trim() ? taglineInput : 'Sign in to manage your boards'}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 pt-0">
                      <button 
                        className="w-full h-9 text-sm border rounded-md flex items-center justify-center gap-2"
                        style={{
                          backgroundColor: settings.custom_google_button_background_color,
                          color: settings.custom_google_button_text_color,
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