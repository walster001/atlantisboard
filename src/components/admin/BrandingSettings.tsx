import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
}

interface CustomFont {
  id: string;
  name: string;
  font_url: string;
}

// Generate array of sizes from 1 to 72
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
  });
  const [savedSettings, setSavedSettings] = useState<AppSettings | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appNameInput, setAppNameInput] = useState('');
  const [taglineInput, setTaglineInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
    fetchCustomFonts();
  }, []);

  // Load custom font CSS
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
      const { data, error } = await supabase
        .from('app_settings')
        .select('custom_login_logo_enabled, custom_login_logo_url, custom_login_logo_size, custom_app_name_enabled, custom_app_name, custom_app_name_size, custom_app_name_color, custom_app_name_font, custom_tagline_enabled, custom_tagline, custom_tagline_size, custom_tagline_color, custom_tagline_font')
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
      const { data, error } = await supabase
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
      settings.custom_tagline_font !== savedSettings.custom_tagline_font
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
      };

      const { error } = await supabase
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

      const { error } = await supabase
        .from('app_settings')
        .update({ custom_login_logo_url: urlData.publicUrl })
        .eq('id', 'default');

      if (error) throw error;

      setSettings(prev => ({ ...prev, custom_login_logo_url: urlData.publicUrl }));
      setSavedSettings(prev => prev ? { ...prev, custom_login_logo_url: urlData.publicUrl } : prev);

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

      const { error } = await supabase
        .from('app_settings')
        .update({ 
          custom_login_logo_url: null,
          custom_login_logo_enabled: false 
        })
        .eq('id', 'default');

      if (error) throw error;

      setSettings(prev => ({ ...prev, custom_login_logo_url: null, custom_login_logo_enabled: false }));
      setSavedSettings(prev => prev ? { ...prev, custom_login_logo_url: null, custom_login_logo_enabled: false } : prev);
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
              onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, custom_login_logo_enabled: enabled }))}
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

          {settings.custom_login_logo_url && (
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-3 block">Logo Size</Label>
              <Select
                value={settings.custom_login_logo_size}
                onValueChange={(value) => setSettings(prev => ({ ...prev, custom_login_logo_size: value as LogoSize }))}
                disabled={saving}
              >
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
              onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, custom_app_name_enabled: enabled }))}
              disabled={saving || !appNameInput.trim()}
            />
          </div>

          <div className="border-t pt-4">
            <Label htmlFor="app-name-input" className="text-sm font-medium mb-3 block">
              Application Name
            </Label>
            <Input
              id="app-name-input"
              placeholder="Enter your application name"
              value={appNameInput}
              onChange={(e) => setAppNameInput(e.target.value)}
            />
          </div>

          {!appNameInput.trim() && (
            <p className="text-xs text-muted-foreground">
              Enter an app name to enable this feature.
            </p>
          )}

          {appNameInput.trim() && (
            <div className="border-t pt-4 space-y-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">Font, Size & Color</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select
                    value={settings.custom_app_name_font}
                    onValueChange={(font) => setSettings(prev => ({ ...prev, custom_app_name_font: font }))}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Inter (Default)</SelectItem>
                      {customFonts.map((font) => (
                        <SelectItem key={font.id} value={font.id}>
                          {font.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={settings.custom_app_name_size.toString()}
                    onValueChange={(size) => setSettings(prev => ({ ...prev, custom_app_name_size: parseInt(size, 10) }))}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="Size" />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-[200px]">
                        {textSizes.map((size) => (
                          <SelectItem key={size} value={size.toString()}>
                            {size}px
                          </SelectItem>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <div 
                          className="w-4 h-4 rounded-sm border" 
                          style={{ backgroundColor: settings.custom_app_name_color }}
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Pick a color</Label>
                        <input
                          type="color"
                          value={settings.custom_app_name_color}
                          onChange={(e) => setSettings(prev => ({ ...prev, custom_app_name_color: e.target.value }))}
                          className="w-full h-10 cursor-pointer rounded border-0"
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            value={settings.custom_app_name_color}
                            onChange={(e) => setSettings(prev => ({ ...prev, custom_app_name_color: e.target.value }))}
                            className="font-mono text-sm"
                            placeholder="#000000"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                  <span 
                    className="font-bold truncate block" 
                    style={{ 
                      fontSize: `${Math.min(settings.custom_app_name_size, 32)}px`, 
                      lineHeight: 1.2,
                      color: settings.custom_app_name_color,
                      fontFamily: getFontFamily(settings.custom_app_name_font),
                    }}
                    title={appNameInput}
                  >
                    {appNameInput}
                  </span>
                </div>
              </div>
            </div>
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
              onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, custom_tagline_enabled: enabled }))}
              disabled={saving || !taglineInput.trim()}
            />
          </div>

          <div className="border-t pt-4">
            <Label htmlFor="tagline-input" className="text-sm font-medium mb-3 block">
              Tagline Text
            </Label>
            <Input
              id="tagline-input"
              placeholder="Enter your tagline"
              value={taglineInput}
              onChange={(e) => setTaglineInput(e.target.value)}
            />
          </div>

          {!taglineInput.trim() && (
            <p className="text-xs text-muted-foreground">
              Enter a tagline to enable this feature.
            </p>
          )}

          {taglineInput.trim() && (
            <div className="border-t pt-4 space-y-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">Font, Size & Color</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select
                    value={settings.custom_tagline_font}
                    onValueChange={(font) => setSettings(prev => ({ ...prev, custom_tagline_font: font }))}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Inter (Default)</SelectItem>
                      {customFonts.map((font) => (
                        <SelectItem key={font.id} value={font.id}>
                          {font.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={settings.custom_tagline_size.toString()}
                    onValueChange={(size) => setSettings(prev => ({ ...prev, custom_tagline_size: parseInt(size, 10) }))}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="Size" />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-[200px]">
                        {textSizes.map((size) => (
                          <SelectItem key={size} value={size.toString()}>
                            {size}px
                          </SelectItem>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <div 
                          className="w-4 h-4 rounded-sm border" 
                          style={{ backgroundColor: settings.custom_tagline_color }}
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Pick a color</Label>
                        <input
                          type="color"
                          value={settings.custom_tagline_color}
                          onChange={(e) => setSettings(prev => ({ ...prev, custom_tagline_color: e.target.value }))}
                          className="w-full h-10 cursor-pointer rounded border-0"
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            value={settings.custom_tagline_color}
                            onChange={(e) => setSettings(prev => ({ ...prev, custom_tagline_color: e.target.value }))}
                            className="font-mono text-sm"
                            placeholder="#6b7280"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                  <span 
                    className="truncate block" 
                    style={{ 
                      fontSize: `${Math.min(settings.custom_tagline_size, 24)}px`, 
                      lineHeight: 1.4,
                      color: settings.custom_tagline_color,
                      fontFamily: getFontFamily(settings.custom_tagline_font),
                    }}
                    title={taglineInput}
                  >
                    {taglineInput}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSaveAll}
          disabled={saving || !hasUnsavedChanges()}
          size="lg"
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
