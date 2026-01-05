import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { uploadFile } from '@/lib/storage';
import { getErrorMessage } from '@/lib/errorHandler';
import { Upload, Image, ExternalLink, Check, Loader2 } from 'lucide-react';
import type { WekanExport } from './types';

// Detected inline button with internal /cdn image reference
export interface DetectedInlineButton {
  id: string;
  imgSrc: string; // The original /cdn image src
  linkHref: string;
  linkText: string;
  cardTitle?: string;
  occurrenceCount: number; // How many times this imgSrc appears
  replacementUrl?: string; // After upload
  localFile?: File; // Local file before upload
  localPreviewUrl?: string; // Object URL for preview
}

interface InlineButtonIconDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedButtons: DetectedInlineButton[];
  onComplete: (replacements: Map<string, string>) => void;
}

// Regex to detect Wekan inline button blocks with /cdn image sources
const INLINE_BUTTON_REGEX = /<span[^>]*style=['"][^'"]*display:\s*inline-?flex[^'"]*['"][^>]*>[\s\S]*?<img[^>]*src=['"]([^'"]*\/cdn[^'"]+)['"][^>]*>[\s\S]*?<a[^>]*href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>[\s\S]*?<\/span>/gi;

// Function to extract unique inline button image sources from HTML content
export function extractInlineButtonsFromHtml(html: string, cardTitle?: string): { imgSrc: string; linkHref: string; linkText: string; cardTitle?: string }[] {
  const buttons: { imgSrc: string; linkHref: string; linkText: string; cardTitle?: string }[] = [];
  let match;

  // Reset regex lastIndex
  INLINE_BUTTON_REGEX.lastIndex = 0;

  while ((match = INLINE_BUTTON_REGEX.exec(html)) !== null) {
    const [, imgSrc, linkHref, linkText] = match;
    
    // Only include if img src starts with /cdn
    if (imgSrc && imgSrc.startsWith('/cdn')) {
      buttons.push({
        imgSrc,
        linkHref,
        linkText: linkText.trim(),
        ...(cardTitle && { cardTitle }),
      });
    }
  }

  return buttons;
}

// Function to scan Wekan data for all inline buttons with /cdn images
// Returns unique imgSrc entries with occurrence counts
export function scanWekanDataForInlineButtons(wekanData: WekanExport): DetectedInlineButton[] {
  const allButtons: { imgSrc: string; linkHref: string; linkText: string; cardTitle?: string }[] = [];

  if (!wekanData) return [];

  // Handle both array of boards and single board
  const boards = Array.isArray(wekanData) ? wekanData : [wekanData];

  for (const board of boards) {
    const boardObj = board as Record<string, unknown>;
    const cards = (boardObj.cards as unknown[] | undefined) || [];
    for (const card of cards) {
      const cardObj = card as Record<string, unknown>;
      if (cardObj.description && typeof cardObj.description === 'string') {
        const cardTitle = cardObj.title as string | undefined;
        const cardButtons = extractInlineButtonsFromHtml(cardObj.description, cardTitle);
        allButtons.push(...cardButtons);
      }
    }
  }

  // Group by imgSrc and count occurrences
  const imgSrcMap = new Map<string, { button: typeof allButtons[0]; count: number }>();
  for (const button of allButtons) {
    const existing = imgSrcMap.get(button.imgSrc);
    if (existing) {
      existing.count++;
    } else {
      imgSrcMap.set(button.imgSrc, { button, count: 1 });
    }
  }

  // Convert to DetectedInlineButton array
  return Array.from(imgSrcMap.entries()).map(([imgSrc, { button, count }], index) => ({
    id: `btn-${index}-${Date.now()}`,
    imgSrc,
    linkHref: button.linkHref,
    linkText: button.linkText,
    ...(button.cardTitle && { cardTitle: button.cardTitle }),
    occurrenceCount: count,
  }));
}

// Function to replace inline button image sources in Wekan data BEFORE import
// This modifies the raw Wekan JSON data directly
export function replaceInlineButtonImagesInWekanData(
  wekanData: WekanExport,
  replacements: Map<string, string>
): WekanExport {
  if (!wekanData || replacements.size === 0) return wekanData;

  // Deep clone to avoid mutating original
  const cloned = JSON.parse(JSON.stringify(wekanData));
  const isArray = Array.isArray(cloned);

  // Handle both array of boards and single board
  const boards = isArray ? cloned : [cloned];

  for (const board of boards) {
    const cards = board.cards || [];
    for (const card of cards) {
      const cardObj = card as Record<string, unknown>;
      if (cardObj.description && typeof cardObj.description === 'string') {
        let desc = cardObj.description;
        for (const [originalSrc, newSrc] of replacements) {
          // Escape special regex characters in the original src
          const escapedSrc = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Replace all occurrences of this img src (both single and double quotes)
          const srcRegex = new RegExp(`src=['"]${escapedSrc}['"]`, 'g');
          desc = desc.replace(srcRegex, `src="${newSrc}"`);
        }
        cardObj.description = desc;
      }
    }
  }

  // Return in same format as input
  return isArray ? cloned : boards[0];
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
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const objectUrlRefs = useRef<Record<string, string>>({}); // Track object URLs for cleanup

  useEffect(() => {
    if (open) {
      // Create copies with reset replacement URLs
      setButtons(detectedButtons.map((btn, index) => {
        const { replacementUrl: _replacementUrl, localFile: _localFile, localPreviewUrl: _localPreviewUrl, ...rest } = btn;
        return {
          ...rest,
          id: `btn-${index}-${Date.now()}`,
        };
      }));
      fileInputRefs.current = {};
      // Clear object URLs when dialog opens (defensive cleanup)
      Object.values(objectUrlRefs.current).forEach(url => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
      objectUrlRefs.current = {};
    }
  }, [open, detectedButtons]);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup all object URLs
      Object.values(objectUrlRefs.current).forEach(url => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
      objectUrlRefs.current = {};
    };
  }, []);

  // Cleanup when dialog closes without completing
  useEffect(() => {
    if (!open) {
      // Cleanup all object URLs when dialog closes
      Object.values(objectUrlRefs.current).forEach(url => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
      objectUrlRefs.current = {};
      // Clear buttons state to remove stale local file references
      setButtons([]);
    }
  }, [open]);

  const handleFileSelect = async (buttonId: string, _imgSrc: string, file: File) => {
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

    // Cleanup previous object URL if exists
    const button = buttons.find(b => b.id === buttonId);
    if (button?.localPreviewUrl && objectUrlRefs.current[buttonId]) {
      URL.revokeObjectURL(objectUrlRefs.current[buttonId]);
      delete objectUrlRefs.current[buttonId];
    }

    // Create object URL for preview
    const previewUrl = URL.createObjectURL(file);
    objectUrlRefs.current[buttonId] = previewUrl;

    // Store file locally (don't upload yet)
    setButtons((prev) =>
      prev.map((btn) =>
        btn.id === buttonId 
          ? { ...btn, localFile: file, localPreviewUrl: previewUrl }
          : btn
      )
    );

    toast({
      title: 'File selected',
      description: 'File will be uploaded when you click "Continue with replacements".',
    });
  };

  const handleComplete = async () => {
    // Upload all files that have been selected
    const filesToUpload = buttons.filter(btn => btn.localFile && !btn.replacementUrl);
    
    if (filesToUpload.length > 0) {
      setUploading('all');
      
      try {
        const uploadPromises = filesToUpload.map(async (button) => {
          if (!button.localFile) return null;

          const fileExt = button.localFile.name.split('.').pop() || 'png';
          const fileName = `inline-icon-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `import-icons/${fileName}`;

          const uploadResult = await uploadFile('branding', filePath, button.localFile);

          if (uploadResult.error || !uploadResult.data) {
            throw uploadResult.error || new Error('Upload failed: No data returned');
          }

          const publicUrl = uploadResult.data.publicUrl;

          // Update button with replacement URL
          return {
            buttonId: button.id,
            replacementUrl: publicUrl,
          };
        });

        const uploadResults = await Promise.all(uploadPromises);

        // Update buttons with uploaded URLs
        setButtons((prev) =>
          prev.map((btn) => {
            const result = uploadResults.find(r => r?.buttonId === btn.id);
            if (result) {
              return {
                ...btn,
                replacementUrl: result.replacementUrl,
              };
            }
            return btn;
          })
        );

        // Cleanup object URLs after successful upload
        uploadResults.forEach(result => {
          if (result && objectUrlRefs.current[result.buttonId]) {
            URL.revokeObjectURL(objectUrlRefs.current[result.buttonId]);
            delete objectUrlRefs.current[result.buttonId];
          }
        });

      } catch (error: unknown) {
        console.error('Upload error:', error);
        const errorMessage = getErrorMessage(error);
        toast({
          title: 'Upload failed',
          description: errorMessage || 'Failed to upload one or more icons.',
          variant: 'destructive',
        });
        setUploading(null);
        return; // Don't proceed if upload fails
      } finally {
        setUploading(null);
      }
    }

    // Build replacement map: imgSrc -> replacementUrl
    const replacements = new Map<string, string>();
    for (const btn of buttons) {
      if (btn.replacementUrl) {
        replacements.set(btn.imgSrc, btn.replacementUrl);
      }
    }
    // Only call onComplete - the parent handles closing
    onComplete(replacements);
  };

  const handleSkip = () => {
    // Cleanup all object URLs before skipping
    Object.values(objectUrlRefs.current).forEach(url => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
    objectUrlRefs.current = {};
    
    // Complete with no replacements - parent handles closing
    onComplete(new Map());
  };

  const uploadedCount = buttons.filter((b) => b.replacementUrl || b.localFile).length;
  const totalOccurrences = buttons.reduce((sum, b) => sum + b.occurrenceCount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Replace Inline Button Icons
          </DialogTitle>
          <DialogDescription>
            Found {buttons.length} unique internal image reference(s) across {totalOccurrences} inline button block(s). 
            These /cdn images won't work after import. Upload replacements before importing.
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
                    {(button.replacementUrl || button.localPreviewUrl) ? (
                      <img
                        src={button.replacementUrl || button.localPreviewUrl}
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

                {/* Occurrence count */}
                {button.occurrenceCount > 1 && (
                  <div className="text-xs text-blue-600">
                    Used in {button.occurrenceCount} inline button blocks
                  </div>
                )}

                {/* Card context if available */}
                {button.cardTitle && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Example card:</span> {button.cardTitle}
                  </div>
                )}

                {/* Upload section */}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={(el) => {
                      fileInputRefs.current[button.id] = el;
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileSelect(button.id, button.imgSrc, file);
                        e.target.value = '';
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRefs.current[button.id]?.click()}
                    disabled={uploading === button.id || uploading === 'all'}
                  >
                    {uploading === button.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (button.replacementUrl || button.localFile) ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                        Change Icon
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Select Icon
                      </>
                    )}
                  </Button>
                  {button.replacementUrl && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Uploaded
                    </span>
                  )}
                  {button.localFile && !button.replacementUrl && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <Image className="h-3 w-3" />
                      Selected (will upload on continue)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-sm text-muted-foreground mr-auto">
            {uploadedCount} of {buttons.length} unique icons {buttons.some(b => b.localFile && !b.replacementUrl) ? 'selected' : 'replaced'}
          </div>
          <Button variant="outline" onClick={handleSkip} disabled={uploading === 'all'}>
            Skip (keep broken icons)
          </Button>
          <Button onClick={handleComplete} disabled={uploading === 'all'}>
            {uploading === 'all' ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : uploadedCount === buttons.length ? (
              'Continue'
            ) : (
              'Continue with replacements'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
