import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Palette, ExternalLink, Type, Loader2, Trash2, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InlineButtonData {
  id: string;
  iconUrl: string;
  iconSize: number; // px
  linkUrl: string;
  linkText: string;
  textColor: string;
  backgroundColor: string;
  borderRadius?: number; // px value, default 4
}

interface InlineButtonEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: InlineButtonData | null;
  onSave: (data: InlineButtonData) => void;
  onDelete?: () => void;
}

const presetColors = [
  '#1D2125', '#282E33', '#3d444d', '#000000',
  '#ffffff', '#579DFF', '#4BADE8', '#60C6D2',
  '#6CC644', '#F5CD47', '#FEA362', '#F87168',
  '#DC49AC', '#9F8FEF',
];

const iconSizes = [12, 14, 16, 18, 20, 24, 28, 32];

// 0-20px options for border radius
const borderRadiusOptions = Array.from({ length: 21 }, (_, i) => i);

const DEFAULT_BORDER_RADIUS = 4;

export function InlineButtonEditor({
  open,
  onOpenChange,
  data,
  onSave,
  onDelete,
}: InlineButtonEditorProps) {
  const { toast } = useToast();
  const [iconUrl, setIconUrl] = useState('');
  const [iconSize, setIconSize] = useState(16);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [textColor, setTextColor] = useState('#579DFF');
  const [backgroundColor, setBackgroundColor] = useState('#1D2125');
  const [borderRadius, setBorderRadius] = useState(DEFAULT_BORDER_RADIUS);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && data) {
      setIconUrl(data.iconUrl || '');
      setIconSize(data.iconSize || 16);
      setLinkUrl(data.linkUrl || '');
      setLinkText(data.linkText || '');
      setTextColor(data.textColor || '#579DFF');
      setBackgroundColor(data.backgroundColor || '#1D2125');
      setBorderRadius(data.borderRadius ?? DEFAULT_BORDER_RADIUS);
    } else if (open) {
      // New button defaults
      setIconUrl('');
      setIconSize(16);
      setLinkUrl('');
      setLinkText('Button');
      setTextColor('#579DFF');
      setBackgroundColor('#1D2125');
      setBorderRadius(DEFAULT_BORDER_RADIUS);
    }
  }, [open, data]);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 500 * 1024) {
      toast({
        title: 'File too large',
        description: 'Icon images should be under 500KB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `inline-icon-${Date.now()}.${fileExt}`;
      const filePath = `inline-icons/${fileName}`;

      const { error } = await supabase.storage
        .from('branding')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(filePath);

      setIconUrl(urlData.publicUrl);
      toast({ title: 'Icon uploaded' });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!linkText.trim()) {
      toast({
        title: 'Button text required',
        description: 'Please enter text for the button.',
        variant: 'destructive',
      });
      return;
    }

    const id = data?.id || `inline-btn-${Date.now()}`;
    onSave({
      id,
      iconUrl,
      iconSize,
      linkUrl: linkUrl.trim(),
      linkText: linkText.trim(),
      textColor,
      backgroundColor,
      borderRadius,
    });
    onOpenChange(false);
  };

  const ColorPicker = ({ 
    value, 
    onChange, 
    label 
  }: { 
    value: string; 
    onChange: (v: string) => void; 
    label: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
          >
            <div
              className="w-4 h-4 rounded border"
              style={{ backgroundColor: value }}
            />
            <span className="text-xs font-mono">{value}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border"
              />
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
                placeholder="#000000"
              />
            </div>
            <div className="grid grid-cols-7 gap-1">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange(color)}
                  className={cn(
                    'h-6 w-6 rounded border hover:scale-110 transition-transform',
                    color === '#ffffff' ? 'border-border' : 'border-transparent'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            {data ? 'Edit Inline Button' : 'Insert Inline Button'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Live Preview */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 text-sm"
                style={{
                  backgroundColor,
                  border: '1px solid #3d444d',
                  borderRadius: `${borderRadius}px`,
                }}
              >
                {iconUrl && (
                  <img
                    src={iconUrl}
                    alt=""
                    style={{ width: iconSize, height: iconSize }}
                    className="object-contain"
                  />
                )}
                <span style={{ color: textColor }}>
                  {linkText || 'Button text'}
                </span>
              </span>
            </div>
          </div>

          {/* Icon Upload */}
          <div className="space-y-2">
            <Label className="text-xs">Icon</Label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file);
                    e.target.value = '';
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {iconUrl ? 'Change' : 'Upload'}
              </Button>
              {iconUrl && (
                <>
                  <img
                    src={iconUrl}
                    alt="icon"
                    className="h-6 w-6 object-contain rounded border"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIconUrl('')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Icon Size (only if icon exists) */}
          {iconUrl && (
            <div className="space-y-2">
              <Label className="text-xs">Icon Size</Label>
              <Select
                value={String(iconSize)}
                onValueChange={(v) => setIconSize(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconSizes.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}px
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Link URL */}
          <div className="space-y-2">
            <Label className="text-xs">Link URL</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="text-sm"
            />
          </div>

          {/* Link Text */}
          <div className="space-y-2">
            <Label className="text-xs">Button Text</Label>
            <Input
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="Click here"
              className="text-sm"
            />
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <ColorPicker
              label="Text Color"
              value={textColor}
              onChange={setTextColor}
            />
            <ColorPicker
              label="Background Color"
              value={backgroundColor}
              onChange={setBackgroundColor}
            />
          </div>

          {/* Border Radius */}
          <div className="space-y-2">
            <Label className="text-xs">Roundness</Label>
            <Select
              value={String(borderRadius)}
              onValueChange={(v) => setBorderRadius(Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {borderRadiusOptions.map((px) => (
                  <SelectItem key={px} value={String(px)}>
                    {px}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between gap-2">
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {data ? 'Save' : 'Insert'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Parse inline button data from base64-encoded data attribute.
 * This is the primary parsing function used by widgetRules.
 */
export function parseInlineButtonFromDataAttr(dataAttr: string): InlineButtonData | null {
  try {
    const decoded = decodeURIComponent(escape(atob(dataAttr)));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Encode inline button data to base64 for storage in markdown.
 */
export function encodeInlineButtonData(data: InlineButtonData): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}
