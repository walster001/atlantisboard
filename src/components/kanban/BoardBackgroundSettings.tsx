import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { ThemeColorInput } from './ThemeColorInput';
import { cn } from '@/lib/utils';

interface BoardTheme {
  id: string;
  name: string;
  navbar_color: string;
  column_color: string;
  default_card_color: string | null;
  homepage_board_color: string;
  board_icon_color: string;
  scrollbar_color: string;
  scrollbar_track_color: string;
}

interface BoardBackgroundSettingsProps {
  boardId: string;
  currentBackgroundColor: string;
  currentBackgroundImageUrl: string | null;
  currentTheme: BoardTheme | null;
  userRole: 'admin' | 'manager' | 'viewer' | null;
  onBackgroundChange: () => void;
}

type BackgroundType = 'color' | 'image';

export function BoardBackgroundSettings({
  boardId,
  currentBackgroundColor,
  currentBackgroundImageUrl,
  currentTheme,
  userRole,
  onBackgroundChange,
}: BoardBackgroundSettingsProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Get default background color - uses theme navbar color or fallback to #0079bf
  const getDefaultBackgroundColor = () => {
    if (currentTheme?.navbar_color) {
      return currentTheme.navbar_color;
    }
    return '#0079bf';
  };

  const [backgroundType, setBackgroundType] = useState<BackgroundType>(
    currentBackgroundImageUrl ? 'image' : 'color'
  );
  const [backgroundColor, setBackgroundColor] = useState(currentBackgroundColor || getDefaultBackgroundColor());
  const [imageUrl, setImageUrl] = useState(currentBackgroundImageUrl || '');
  const [imageSize, setImageSize] = useState<'cover' | 'contain' | 'manual'>('cover');
  const [manualWidth, setManualWidth] = useState(100);
  const [manualHeight, setManualHeight] = useState(100);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Use permission system
  const { can } = usePermissions(boardId, userRole);
  const canEdit = can('board.background.edit');

  // Sync local state when props change
  useEffect(() => {
    setBackgroundColor(currentBackgroundColor || getDefaultBackgroundColor());
    setImageUrl(currentBackgroundImageUrl || '');
    setBackgroundType(currentBackgroundImageUrl ? 'image' : 'color');
  }, [currentBackgroundColor, currentBackgroundImageUrl, currentTheme]);

  const handleSaveColor = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('boards')
        .update({ 
          background_color: backgroundColor,
          // Clear image when setting color (mutual exclusivity)
        })
        .eq('id', boardId);

      if (error) throw error;
      toast({ title: 'Background colour saved!' });
      onBackgroundChange();
    } catch (error: any) {
      console.error('Save background colour error:', error);
      toast({ title: 'Error', description: 'Failed to save background colour', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleFollowTheme = async () => {
    if (!canEdit || !currentTheme) return;
    // Use navbar_color as it complements the board header
    const themeColor = currentTheme.navbar_color || '#0079bf';
    setBackgroundColor(themeColor);
    setBackgroundType('color');
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('boards')
        .update({ 
          background_color: themeColor,
        })
        .eq('id', boardId);

      if (error) throw error;
      toast({ title: 'Background set to theme colour!' });
      onBackgroundChange();
    } catch (error: any) {
      console.error('Follow theme error:', error);
      toast({ title: 'Error', description: 'Failed to apply theme colour', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canEdit) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload a JPEG, PNG, GIF, or WebP image.', variant: 'destructive' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 5MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${boardId}-bg-${Date.now()}.${fileExt}`;
      const filePath = `board-backgrounds/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      setImageUrl(publicUrl);
      setBackgroundType('image');
      
      // Save to board
      const { error } = await supabase
        .from('boards')
        .update({ 
          background_color: publicUrl, // Store image URL in background_color field with prefix
        })
        .eq('id', boardId);

      if (error) throw error;
      
      toast({ title: 'Background image uploaded!' });
      onBackgroundChange();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      // Reset to theme navbar color or default
      const defaultColor = getDefaultBackgroundColor();
      const { error } = await supabase
        .from('boards')
        .update({ 
          background_color: defaultColor,
        })
        .eq('id', boardId);

      if (error) throw error;
      
      setImageUrl('');
      setBackgroundType('color');
      setBackgroundColor(defaultColor);
      toast({ title: 'Background image removed' });
      onBackgroundChange();
    } catch (error: any) {
      console.error('Remove image error:', error);
      toast({ title: 'Error', description: 'Failed to remove image', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const isImageBackground = (value: string) => {
    return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:');
  };

  // Determine if current background is actually an image
  const hasImageBackground = isImageBackground(currentBackgroundColor);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Board Background</h3>
        <p className="text-sm text-muted-foreground">
          Customise the background of your board. Choose a colour or upload an image.
        </p>
      </div>

      {!canEdit && (
        <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground">
          Only board admins can change background settings.
        </div>
      )}

      {/* Background Type Toggle */}
      <div className="flex gap-2">
        <Button
          variant={backgroundType === 'color' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBackgroundType('color')}
          disabled={!canEdit}
        >
          Colour
        </Button>
        <Button
          variant={backgroundType === 'image' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBackgroundType('image')}
          disabled={!canEdit}
        >
          Image
        </Button>
      </div>

      {/* Colour Background Section */}
      {backgroundType === 'color' && (
        <div className="space-y-4 border rounded-lg p-4">
          <Label className="text-sm font-medium">Background Colour</Label>
          
          {currentTheme && (
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFollowTheme}
                disabled={!canEdit || saving}
              >
                Use Theme Colour
              </Button>
              <span className="text-xs text-muted-foreground">
                ({currentTheme.navbar_color})
              </span>
            </div>
          )}

          <ThemeColorInput
            label="Custom Colour"
            value={backgroundColor}
            onChange={setBackgroundColor}
          />

          <Button
            onClick={handleSaveColor}
            disabled={!canEdit || saving}
            className="mt-4"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Apply Colour
          </Button>
        </div>
      )}

      {/* Image Background Section */}
      {backgroundType === 'image' && (
        <div className="space-y-4 border rounded-lg p-4">
          <Label className="text-sm font-medium">Background Image</Label>
          
          {/* Current Image Preview */}
          {imageUrl && (
            <div className="relative rounded-lg overflow-hidden border">
              <img
                src={imageUrl}
                alt="Board background"
                className="w-full h-32 object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={handleRemoveImage}
                disabled={!canEdit || saving}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Upload Button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileUpload}
              className="hidden"
              disabled={!canEdit || uploading}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canEdit || uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {imageUrl ? 'Replace Image' : 'Upload Image'}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Max file size: 5MB. Supported: JPEG, PNG, GIF, WebP
            </p>
          </div>

          {/* Image Sizing Options */}
          {imageUrl && (
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-medium">Image Sizing</Label>
              <div className="flex gap-2">
                <Button
                  variant={imageSize === 'cover' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImageSize('cover')}
                  disabled={!canEdit}
                >
                  Cover (Smart)
                </Button>
                <Button
                  variant={imageSize === 'contain' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImageSize('contain')}
                  disabled={!canEdit}
                >
                  Contain
                </Button>
                <Button
                  variant={imageSize === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImageSize('manual')}
                  disabled={!canEdit}
                >
                  Manual
                </Button>
              </div>
              
              {imageSize === 'manual' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Width (%)</Label>
                    <Slider
                      value={[manualWidth]}
                      onValueChange={([v]) => setManualWidth(v)}
                      min={50}
                      max={200}
                      step={5}
                      disabled={!canEdit}
                    />
                    <span className="text-xs text-muted-foreground">{manualWidth}%</span>
                  </div>
                  <div>
                    <Label className="text-xs">Height (%)</Label>
                    <Slider
                      value={[manualHeight]}
                      onValueChange={([v]) => setManualHeight(v)}
                      min={50}
                      max={200}
                      step={5}
                      disabled={!canEdit}
                    />
                    <span className="text-xs text-muted-foreground">{manualHeight}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      <div className="border rounded-lg p-4">
        <Label className="text-sm font-medium mb-3 block">Preview</Label>
        <div 
          className="h-24 rounded-lg border overflow-hidden"
          style={
            backgroundType === 'image' && imageUrl
              ? {
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: imageSize === 'cover' ? 'cover' : imageSize === 'contain' ? 'contain' : `${manualWidth}% ${manualHeight}%`,
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }
              : {
                  backgroundColor: backgroundColor,
                }
          }
        >
          {/* Preview header bar to show navbar isn't affected */}
          <div className="h-6 bg-black/20 backdrop-blur-sm flex items-center px-2">
            <span className="text-[10px] text-white/80">Navbar (not affected)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
