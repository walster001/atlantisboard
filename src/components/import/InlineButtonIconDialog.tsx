import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Image, ExternalLink, Check, Loader2 } from 'lucide-react';

// Detected inline button block with internal image reference
export interface DetectedInlineButton {
  id: string;
  originalHtml: string;
  imgSrc: string;
  linkHref: string;
  linkText: string;
  cardTitle?: string;
  // After upload
  replacementUrl?: string;
}

interface InlineButtonIconDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedButtons: DetectedInlineButton[];
  onComplete: (updatedButtons: DetectedInlineButton[]) => void;
}

// Regex to detect Wekan inline button blocks with /cdn image sources
const INLINE_BUTTON_REGEX = /<span[^>]*style=['"][^'"]*display:\s*inline-flex[^'"]*['"][^>]*>[\s\S]*?<img[^>]*src=['"]([^'"]*\/cdn[^'"]+)['"][^>]*>[\s\S]*?<a[^>]*href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>[\s\S]*?<\/span>/gi;

// Function to extract inline buttons from HTML content
export function extractInlineButtonsFromHtml(html: string, cardTitle?: string): DetectedInlineButton[] {
  const buttons: DetectedInlineButton[] = [];
  let match;

  // Reset regex lastIndex
  INLINE_BUTTON_REGEX.lastIndex = 0;

  while ((match = INLINE_BUTTON_REGEX.exec(html)) !== null) {
    const [fullMatch, imgSrc, linkHref, linkText] = match;
    
    // Only include if img src starts with /cdn
    if (imgSrc && imgSrc.startsWith('/cdn')) {
      buttons.push({
        id: `btn-${buttons.length}-${Date.now()}`,
        originalHtml: fullMatch,
        imgSrc,
        linkHref,
        linkText: linkText.trim(),
        cardTitle,
      });
    }
  }

  return buttons;
}

// Function to scan Wekan data for all inline buttons with /cdn images
export function scanWekanDataForInlineButtons(wekanData: any): DetectedInlineButton[] {
  const allButtons: DetectedInlineButton[] = [];

  if (!wekanData) return allButtons;

  // Handle both array of boards and single board
  const boards = Array.isArray(wekanData) ? wekanData : [wekanData];

  for (const board of boards) {
    const cards = board.cards || [];
    for (const card of cards) {
      if (card.description && typeof card.description === 'string') {
        const cardButtons = extractInlineButtonsFromHtml(card.description, card.title);
        allButtons.push(...cardButtons);
      }
    }
  }

  // Deduplicate by imgSrc (same icon might appear multiple times)
  const uniqueByImgSrc = new Map<string, DetectedInlineButton>();
  for (const button of allButtons) {
    if (!uniqueByImgSrc.has(button.imgSrc)) {
      uniqueByImgSrc.set(button.imgSrc, button);
    }
  }

  return Array.from(uniqueByImgSrc.values());
}

// Function to replace inline button image sources in HTML
export function replaceInlineButtonImages(
  html: string,
  replacements: Map<string, string>
): string {
  let result = html;

  for (const [originalSrc, newSrc] of replacements) {
    // Escape special regex characters in the original src
    const escapedSrc = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace all occurrences of this img src
    const srcRegex = new RegExp(`src=['"]${escapedSrc}['"]`, 'g');
    result = result.replace(srcRegex, `src="${newSrc}"`);
  }

  return result;
}

export function InlineButtonIconDialog({
  open,
  onOpenChange,
  detectedButtons,
  onComplete,
}: InlineButtonIconDialogProps) {
  const { toast } = useToast();
  const [buttons, setButtons] = useState<DetectedInlineButton[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (open) {
      setButtons([...detectedButtons]);
    }
  }, [open, detectedButtons]);

  const handleFileSelect = async (buttonId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    // Max 500KB for icons
    if (file.size > 500 * 1024) {
      toast({
        title: 'File too large',
        description: 'Icon images should be under 500KB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(buttonId);

    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `inline-icon-${Date.now()}.${fileExt}`;
      const filePath = `import-icons/${fileName}`;

      const { data, error } = await supabase.storage
        .from('branding')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update button with replacement URL
      setButtons((prev) =>
        prev.map((btn) =>
          btn.id === buttonId ? { ...btn, replacementUrl: publicUrl } : btn
        )
      );

      toast({
        title: 'Icon uploaded',
        description: 'The replacement icon has been uploaded.',
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload icon.',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  };

  const handleComplete = () => {
    onComplete(buttons);
    onOpenChange(false);
  };

  const handleSkip = () => {
    // Complete without any replacements
    onComplete(detectedButtons);
    onOpenChange(false);
  };

  const uploadedCount = buttons.filter((b) => b.replacementUrl).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Replace Inline Button Icons
          </DialogTitle>
          <DialogDescription>
            The imported data contains {detectedButtons.length} inline button block(s) with internal Wekan image references that won't work after import. Upload replacement icons for each.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {buttons.map((button) => (
              <div
                key={button.id}
                className="rounded-lg border p-4 space-y-3 bg-muted/30"
              >
                {/* Live preview of the button */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Preview:</Label>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm"
                    style={{
                      backgroundColor: '#1D2125',
                      border: '1px solid #3d444d',
                    }}
                  >
                    {button.replacementUrl ? (
                      <img
                        src={button.replacementUrl}
                        alt="icon"
                        className="h-4 w-4 object-contain"
                      />
                    ) : (
                      <div className="h-4 w-4 bg-muted rounded flex items-center justify-center">
                        <span className="text-[8px] text-muted-foreground">?</span>
                      </div>
                    )}
                    <a
                      href={button.linkHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#579DFF] hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {button.linkText}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                </div>

                {/* Original image reference */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Original image:</span>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
                    {button.imgSrc}
                  </code>
                </div>

                {/* Card context if available */}
                {button.cardTitle && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Found in card:</span> {button.cardTitle}
                  </div>
                )}

                {/* Upload section */}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={(el) => {
                      if (el) fileInputRefs.current.set(button.id, el);
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(button.id, file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRefs.current.get(button.id)?.click()}
                    disabled={uploading === button.id}
                  >
                    {uploading === button.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : button.replacementUrl ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                        Change Icon
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Icon
                      </>
                    )}
                  </Button>
                  {button.replacementUrl && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Uploaded
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-sm text-muted-foreground mr-auto">
            {uploadedCount} of {buttons.length} icons replaced
          </div>
          <Button variant="outline" onClick={handleSkip}>
            Skip (keep broken icons)
          </Button>
          <Button onClick={handleComplete}>
            {uploadedCount === buttons.length ? 'Continue' : 'Continue with replacements'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
