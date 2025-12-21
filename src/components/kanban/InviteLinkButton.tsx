import { useState } from 'react';
import { Link2, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface InviteLinkButtonProps {
  boardId: string;
  canGenerateInvite: boolean;
}

export function InviteLinkButton({ boardId, canGenerateInvite }: InviteLinkButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Don't render anything if user can't generate invites (server-side check happens in edge function)
  if (!canGenerateInvite) {
    return null;
  }

  const generateInviteLink = async () => {
    setIsGenerating(true);
    setInviteLink(null);
    setExpiresAt(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-invite-token', {
        body: { boardId },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.message || 'Failed to generate invite link');
      }

      // Construct the full invite URL
      const baseUrl = window.location.origin;
      const fullLink = `${baseUrl}/invite/${data.token}`;
      setInviteLink(fullLink);
      setExpiresAt(data.expiresAt);
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

  const copyToClipboard = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset state when closing
      setInviteLink(null);
      setExpiresAt(null);
      setCopied(false);
    }
  };

  const formatExpiryTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
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
              Create a one-time invite link to add someone to this board as a viewer.
              The link expires after 24 hours or first use.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {!inviteLink ? (
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
                    onClick={copyToClipboard}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {expiresAt && (
                  <p className="text-sm text-muted-foreground">
                    Expires: {formatExpiryTime(expiresAt)}
                  </p>
                )}
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• This link can only be used once</p>
                  <p>• The recipient will join as a viewer (read-only)</p>
                  <p>• They must sign in with Google to join</p>
                </div>
                <Button
                  variant="outline"
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
                    'Generate New Link'
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
