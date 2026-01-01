import { useState, useEffect } from 'react';
import { Link2, Copy, Check, Loader2, Trash2, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface InviteLinkButtonProps {
  boardId: string;
  canGenerateInvite: boolean;
}

interface ActiveRecurringLink {
  id: string;
  token: string;
  expires_at: string | null;
  created_at: string;
}

export function InviteLinkButton({ boardId, canGenerateInvite }: InviteLinkButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<'one_time' | 'recurring'>('one_time');
  const [generatedLinkType, setGeneratedLinkType] = useState<'one_time' | 'recurring' | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeRecurringLinks, setActiveRecurringLinks] = useState<ActiveRecurringLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // Don't render anything if user can't generate invites (server-side check happens in REST endpoint)
  if (!canGenerateInvite) {
    return null;
  }

  // Fetch active recurring links when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchActiveRecurringLinks();
    }
  }, [isOpen, boardId]);

  const fetchActiveRecurringLinks = async () => {
    setIsLoadingLinks(true);
    try {
      // Recurring links have no expiry (expires_at is NULL), so we don't filter by expiry
      const { data, error } = await supabase
        .from('board_invite_tokens')
        .select('id, token, expires_at, created_at')
        .eq('board_id', boardId)
        .eq('link_type', 'recurring')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching recurring links:', error);
      } else {
        setActiveRecurringLinks(data || []);
      }
    } catch (error) {
      console.error('Error fetching recurring links:', error);
    } finally {
      setIsLoadingLinks(false);
    }
  };

  const generateInviteLink = async () => {
    setIsGenerating(true);
    setInviteLink(null);
    setExpiresAt(null);

    try {
      console.log('Generating invite link with type:', linkType);
      const { data, error } = await api.request(`/boards/${boardId}/invites/generate`, {
        method: 'POST',
        body: JSON.stringify({ linkType }),
      });

      if (error) {
        console.error('API error:', error);
        throw error;
      }

      console.log('Generate invite response:', data);

      if (!data.success) {
        throw new Error(data.message || 'Failed to generate invite link');
      }

      // Construct the full invite URL
      const baseUrl = window.location.origin;
      const fullLink = `${baseUrl}/invite/${data.token}`;
      setInviteLink(fullLink);
      setExpiresAt(data.expiresAt);
      setGeneratedLinkType(data.linkType);

      // Refresh recurring links list if we just created one
      if (linkType === 'recurring') {
        fetchActiveRecurringLinks();
      }
    } catch (error: any) {
      console.error('Error generating invite link:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate invite link',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (link?: string) => {
    const linkToCopy = link || inviteLink;
    if (!linkToCopy) return;

    try {
      await navigator.clipboard.writeText(linkToCopy);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Invite link copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  const deleteRecurringLink = async (tokenId: string) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('board_invite_tokens')
        .delete()
        .eq('id', tokenId);

      if (error) {
        throw error;
      }

      toast({
        title: 'Link deleted',
        description: 'The recurring invite link has been removed',
      });

      // Refresh the list
      fetchActiveRecurringLinks();

      // Clear the generated link if it was the deleted one
      if (inviteLink && activeRecurringLinks.find(l => l.id === tokenId)) {
        setInviteLink(null);
        setExpiresAt(null);
        setGeneratedLinkType(null);
      }
    } catch (error: any) {
      console.error('Error deleting link:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete invite link',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset state when closing
      setInviteLink(null);
      setExpiresAt(null);
      setCopied(false);
      setLinkType('one_time');
      setGeneratedLinkType(null);
    }
  };

  const formatExpiryTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const getFullLink = (token: string) => {
    return `${window.location.origin}/invite/${token}`;
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/20"
        onClick={() => setIsOpen(true)}
        title="Generate Invite Link"
      >
        <Link2 className="h-5 w-5" />
      </Button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Invite Link</DialogTitle>
            <DialogDescription>
              Create an invite link to add someone to this board as a viewer.
              Links expire after 24 hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {!inviteLink ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label>Link Type</Label>
                  <RadioGroup
                    value={linkType}
                    onValueChange={(value) => setLinkType(value as 'one_time' | 'recurring')}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-3 p-3 rounded-md border hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value="one_time" id="one_time" />
                      <Label htmlFor="one_time" className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">One-time use</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Link becomes invalid after first use
                        </p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 rounded-md border hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value="recurring" id="recurring" />
                      <Label htmlFor="recurring" className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span className="font-medium">Recurring</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Multiple users can join with the same link
                        </p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <Button
                  onClick={generateInviteLink}
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Generate Invite Link
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={inviteLink}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard()}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {generatedLinkType === 'one_time' && expiresAt && (
                  <p className="text-sm text-muted-foreground">
                    Expires: {formatExpiryTime(expiresAt)}
                  </p>
                )}
                <div className="text-sm text-muted-foreground space-y-1">
                  {generatedLinkType === 'one_time' ? (
                    <p>• This link can only be used once (expires in 24 hours)</p>
                  ) : (
                    <p>• This link can be used by multiple users (no expiry)</p>
                  )}
                  <p>• Recipients will join as viewers (read-only)</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setInviteLink(null);
                    setExpiresAt(null);
                    setGeneratedLinkType(null);
                  }}
                  className="w-full"
                >
                  Generate Another Link
                </Button>
              </div>
            )}

            {/* Active Recurring Links Section */}
            {activeRecurringLinks.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Active Recurring Links</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {activeRecurringLinks.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between p-2 rounded-md border bg-muted/30 text-sm"
                      >
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-mono text-xs truncate">
                            ...{link.token.slice(-20)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {link.expires_at ? `Expires: ${formatExpiryTime(link.expires_at)}` : 'No expiry'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(getFullLink(link.token))}
                            title="Copy link"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirmId(link.id)}
                            title="Delete link"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Link</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this recurring invite link? Anyone who has this link
              will no longer be able to join the board using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteRecurringLink(deleteConfirmId)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
