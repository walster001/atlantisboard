import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Paperclip, Upload, CheckCircle, AlertCircle, Loader2, FileIcon, Trash2, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface PendingAttachment {
  id: string;
  board_id: string;
  card_id: string;
  original_attachment_id: string | null;
  original_name: string;
  original_url: string | null;
  original_size: number | null;
  original_type: string | null;
  import_source: string;
  uploaded_file_url: string | null;
  resolved_at: string | null;
  card_title?: string;
  board_name?: string;
}

interface ImportAttachmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function ImportAttachmentDialog({ open, onOpenChange, onComplete }: ImportAttachmentDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'uploading' | 'done' | 'error'>>({});

  useEffect(() => {
    if (open) {
      fetchPendingAttachments();
    }
  }, [open]);

  const fetchPendingAttachments = async () => {
    setLoading(true);
    try {
      // Get pending attachments with card and board info
      const { data: attachments, error } = await supabase
        .from('import_pending_attachments')
        .select('*')
        .is('resolved_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (attachments && attachments.length > 0) {
        // Get card titles
        const cardIds = [...new Set(attachments.map(a => a.card_id))];
        const { data: cards } = await supabase
          .from('cards')
          .select('id, title')
          .in('id', cardIds);

        // Get board names
        const boardIds = [...new Set(attachments.map(a => a.board_id))];
        const { data: boards } = await supabase
          .from('boards')
          .select('id, name')
          .in('id', boardIds);

        const cardMap = new Map((cards || []).map(c => [c.id, c.title]));
        const boardMap = new Map((boards || []).map(b => [b.id, b.name]));

        const enriched: PendingAttachment[] = attachments.map(a => ({
          ...a,
          card_title: cardMap.get(a.card_id) || 'Unknown Card',
          board_name: boardMap.get(a.board_id) || 'Unknown Board',
        }));

        setPendingAttachments(enriched);
      } else {
        setPendingAttachments([]);
      }
    } catch (error: any) {
      console.error('Error fetching pending attachments:', error);
      toast({
        title: 'Error loading attachments',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (attachmentId: string, file: File) => {
    setUploadProgress(prev => ({ ...prev, [attachmentId]: 'uploading' }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const attachment = pendingAttachments.find(a => a.id === attachmentId);
      if (!attachment) throw new Error('Attachment not found');

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${attachment.card_id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('card-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('card-attachments')
        .getPublicUrl(fileName);

      // Create card_attachment record
      const { error: insertError } = await supabase
        .from('card_attachments')
        .insert({
          card_id: attachment.card_id,
          file_name: attachment.original_name,
          file_url: urlData.publicUrl,
          file_size: file.size,
          file_type: file.type,
          uploaded_by: user.id,
        });

      if (insertError) throw insertError;

      // Mark pending attachment as resolved
      const { error: updateError } = await supabase
        .from('import_pending_attachments')
        .update({
          uploaded_file_url: urlData.publicUrl,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', attachmentId);

      if (updateError) throw updateError;

      setUploadProgress(prev => ({ ...prev, [attachmentId]: 'done' }));
      
      // Remove from list after short delay
      setTimeout(() => {
        setPendingAttachments(prev => prev.filter(a => a.id !== attachmentId));
        setUploadProgress(prev => {
          const { [attachmentId]: _, ...rest } = prev;
          return rest;
        });
      }, 1000);

    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadProgress(prev => ({ ...prev, [attachmentId]: 'error' }));
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleBulkUpload = async (files: FileList) => {
    setUploading(true);
    const fileArray = Array.from(files);
    let matched = 0;
    let unmatched = 0;

    for (const file of fileArray) {
      // Try to match file name to pending attachments
      const matchingAttachment = pendingAttachments.find(a => 
        a.original_name.toLowerCase() === file.name.toLowerCase() &&
        !uploadProgress[a.id]
      );

      if (matchingAttachment) {
        await handleFileUpload(matchingAttachment.id, file);
        matched++;
      } else {
        unmatched++;
      }
    }

    if (matched > 0 || unmatched > 0) {
      toast({
        title: 'Bulk upload complete',
        description: `${matched} files matched and uploaded. ${unmatched} files could not be matched.`,
      });
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      const { error } = await supabase
        .from('import_pending_attachments')
        .delete()
        .eq('id', attachmentId);

      if (error) throw error;

      setPendingAttachments(prev => prev.filter(a => a.id !== attachmentId));
      toast({ title: 'Pending attachment removed' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    onComplete?.();
  };

  const filteredAttachments = pendingAttachments.filter(a =>
    a.original_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.card_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.board_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedByBoard = filteredAttachments.reduce((acc, attachment) => {
    const boardName = attachment.board_name || 'Unknown Board';
    if (!acc[boardName]) {
      acc[boardName] = [];
    }
    acc[boardName].push(attachment);
    return acc;
  }, {} as Record<string, PendingAttachment[]>);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            Import Attachments
          </DialogTitle>
          <DialogDescription>
            Upload missing attachments from imported boards. Match files by name or upload individually.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pendingAttachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">All attachments uploaded!</p>
            <p className="text-sm text-muted-foreground mt-1">
              There are no pending attachments that need to be uploaded.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <Input
                placeholder="Search by filename, card, or board..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleBulkUpload(e.target.files)}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Bulk Upload
              </Button>
            </div>

            <div className="text-sm text-muted-foreground mb-2">
              {pendingAttachments.length} attachment{pendingAttachments.length !== 1 ? 's' : ''} pending
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6">
                {Object.entries(groupedByBoard).map(([boardName, attachments]) => (
                  <div key={boardName}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                      {boardName}
                    </h3>
                    <div className="space-y-2">
                      {attachments.map((attachment) => {
                        const status = uploadProgress[attachment.id];
                        
                        return (
                          <div
                            key={attachment.id}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                          >
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              {status === 'done' ? (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              ) : status === 'uploading' ? (
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              ) : status === 'error' ? (
                                <AlertCircle className="h-5 w-5 text-destructive" />
                              ) : (
                                <FileIcon className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{attachment.original_name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground truncate">
                                  Card: {attachment.card_title}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  {attachment.import_source}
                                </Badge>
                              </div>
                            </div>

                            {attachment.original_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => window.open(attachment.original_url!, '_blank')}
                                title="View original URL"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}

                            {status !== 'done' && (
                              <>
                                <input
                                  type="file"
                                  id={`file-${attachment.id}`}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(attachment.id, file);
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={status === 'uploading'}
                                  onClick={() => document.getElementById(`file-${attachment.id}`)?.click()}
                                >
                                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                                  Upload
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                                  onClick={() => handleDelete(attachment.id)}
                                  title="Remove from list"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
