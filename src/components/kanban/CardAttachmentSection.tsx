import { useState, useRef } from 'react';
import { api } from '@/integrations/api/client';
import { uploadFile, deleteFile, extractStoragePathFromUrl } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Paperclip, Download, Trash2, Upload, FileIcon, Image as ImageIcon, File, Loader2, ExternalLink, Eye } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Attachment {
  id: string;
  card_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface CardAttachmentSectionProps {
  cardId: string;
  attachments: Attachment[];
  onAttachmentsChange: () => void;
  disabled?: boolean;
  themeTextColor?: string;
  themeButtonColor?: string;
  themeButtonTextColor?: string;
  themeButtonHoverColor?: string;
  themeButtonHoverTextColor?: string;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/');
}

function getFileIcon(mimeType: string | null) {
  if (isImageType(mimeType)) return ImageIcon;
  return File;
}

export function CardAttachmentSection({
  cardId,
  attachments,
  onAttachmentsChange,
  disabled = false,
  themeTextColor,
  themeButtonColor,
  themeButtonTextColor,
  themeButtonHoverColor,
  themeButtonHoverTextColor,
}: CardAttachmentSectionProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const { data: { session } } = await api.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');

      for (const file of Array.from(files)) {
        // Upload to storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${cardId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const uploadResult = await uploadFile('card-attachments', fileName, file);

        if (uploadResult.error || !uploadResult.data) {
          toast({
            title: 'Upload failed',
            description: `Failed to upload ${file.name}: ${uploadResult.error?.message || 'Unknown error'}`,
            variant: 'destructive',
          });
          continue;
        }

        // Use publicUrl from upload response
        const publicUrl = uploadResult.data.publicUrl;

        // Create attachment record
        const { error: insertError } = await api
          .from('card_attachments')
          .insert({
            card_id: cardId,
            file_name: file.name,
            file_url: publicUrl,
            file_size: file.size,
            file_type: file.type,
            uploaded_by: user.id,
          });

        if (insertError) {
          toast({
            title: 'Error',
            description: `Failed to save attachment record: ${insertError.message}`,
            variant: 'destructive',
          });
        }
      }

      toast({ title: 'Files uploaded successfully' });
      onAttachmentsChange();
    } catch (error: any) {
      toast({
        title: 'Upload error',
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

  const handleDelete = async (attachment: Attachment) => {
    try {
      // Extract the storage path from URL
      const storagePath = extractStoragePathFromUrl(attachment.file_url, 'card-attachments');
      if (!storagePath) {
        console.error('Failed to extract storage path from URL');
        // Continue with database deletion even if storage path extraction fails
      } else {
        const deleteResult = await deleteFile('card-attachments', storagePath);
        if (deleteResult.error) {
          console.error('Failed to delete attachment file:', deleteResult.error);
        }
      }

      const { error } = await api
        .from('card_attachments')
        .eq('id', attachment.id)
        .delete();

      if (error) throw error;

      toast({ title: 'Attachment deleted' });
      onAttachmentsChange();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDownload = (attachment: Attachment) => {
    const link = document.createElement('a');
    link.href = attachment.file_url;
    link.download = attachment.file_name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (attachment: Attachment) => {
    if (isImageType(attachment.file_type)) {
      setPreviewUrl(attachment.file_url);
      setPreviewName(attachment.file_name);
    } else {
      // Open in new tab for non-images
      window.open(attachment.file_url, '_blank');
    }
  };

  // Check if custom button colors are provided
  const hasCustomButtonColors = !!themeButtonColor;
  
  // Button style for themed buttons
  const buttonStyle: React.CSSProperties = hasCustomButtonColors ? {
    backgroundColor: themeButtonColor,
    color: themeButtonTextColor || '#ffffff',
    borderColor: themeButtonColor,
  } : {};
  
  // Button class for hover states
  const themedButtonClass = hasCustomButtonColors ? 'themed-button' : '';
  
  // CSS custom properties for container
  const containerStyle: React.CSSProperties = hasCustomButtonColors ? {
    '--theme-btn-bg': themeButtonColor,
    '--theme-btn-color': themeButtonTextColor || '#ffffff',
    '--theme-btn-hover-bg': themeButtonHoverColor || themeButtonColor,
    '--theme-btn-hover-color': themeButtonHoverTextColor || themeButtonTextColor || '#ffffff',
  } as React.CSSProperties : {};

  return (
    <div className="space-y-2" style={containerStyle}>
      <div className="flex items-center justify-between">
        <div 
          className={cn("flex items-center gap-2", !themeTextColor && "text-muted-foreground")}
          style={themeTextColor ? { color: themeTextColor, opacity: 0.7 } : undefined}
        >
          <Paperclip className="h-4 w-4" />
          <span className="text-sm font-medium">
            Attachments {attachments.length > 0 && `(${attachments.length})`}
          </span>
        </div>
        {!disabled && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant={hasCustomButtonColors ? "default" : "outline"}
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn("h-8", themedButtonClass)}
              style={hasCustomButtonColors ? buttonStyle : undefined}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Add
            </Button>
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-2">
          {disabled ? 'No attachments' : 'No attachments yet. Click Add to upload files.'}
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const FileIconComponent = getFileIcon(attachment.file_type);
            const isImage = isImageType(attachment.file_type);
            
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
              >
                {isImage ? (
                  <div className="h-10 w-10 rounded overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={attachment.file_url}
                      alt={attachment.file_name}
                      className="h-full w-full object-cover cursor-pointer"
                      onClick={() => handlePreview(attachment)}
                    />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <FileIconComponent className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.file_size)}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePreview(attachment)}
                    title="Preview"
                  >
                    {isImage ? <Eye className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(attachment)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(attachment)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <div className="relative">
            <img
              src={previewUrl || ''}
              alt={previewName}
              className="w-full h-auto max-h-[80vh] object-contain bg-black"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <p className="text-white text-sm truncate">{previewName}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
