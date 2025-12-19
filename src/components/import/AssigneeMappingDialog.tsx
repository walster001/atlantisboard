import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Users, Search, Loader2, CheckCircle, UserPlus, ChevronDown, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface PendingAssignee {
  id: string;
  board_id: string;
  card_id: string;
  original_member_id: string | null;
  original_member_name: string;
  original_username: string | null;
  mapped_user_id: string | null;
  import_source: string;
  created_at: string;
  resolved_at: string | null;
  board_name?: string;
  card_title?: string;
}

interface WorkspaceUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface AssigneeMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMappingComplete: () => void;
}

export function AssigneeMappingDialog({ open, onOpenChange, onMappingComplete }: AssigneeMappingDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pendingAssignees, setPendingAssignees] = useState<PendingAssignee[]>([]);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get pending assignees with board and card info
      const { data: pending, error: pendingError } = await supabase
        .from('import_pending_assignees')
        .select(`
          *,
          boards:board_id (name),
          cards:card_id (title)
        `)
        .is('resolved_at', null)
        .order('created_at', { ascending: false });

      if (pendingError) throw pendingError;

      const formattedPending = (pending || []).map((p: any) => ({
        ...p,
        board_name: p.boards?.name,
        card_title: p.cards?.title,
      }));

      setPendingAssignees(formattedPending);

      // Expand all boards by default
      const boardIds = new Set(formattedPending.map((p: PendingAssignee) => p.board_id));
      setExpandedBoards(boardIds);

      // Get all profiles as potential mapping targets
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .order('full_name');

      if (profilesError) throw profilesError;
      setWorkspaceUsers(profiles || []);

    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Failed to load data',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMappingSelect = (pendingId: string, userId: string) => {
    setSelectedMappings(prev => ({
      ...prev,
      [pendingId]: userId,
    }));
  };

  const applyMappings = async () => {
    const mappingsToApply = Object.entries(selectedMappings);
    if (mappingsToApply.length === 0) {
      toast({
        title: 'No mappings selected',
        description: 'Please select at least one user mapping to apply.',
        variant: 'destructive',
      });
      return;
    }

    setApplying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let successCount = 0;
      let errorCount = 0;

      for (const [pendingId, userId] of mappingsToApply) {
        const pending = pendingAssignees.find(p => p.id === pendingId);
        if (!pending) continue;

        // Create card assignee
        const { error: assigneeError } = await supabase
          .from('card_assignees')
          .insert({
            card_id: pending.card_id,
            user_id: userId,
            assigned_by: user.id,
          });

        if (assigneeError) {
          // Check if it's a duplicate
          if (!assigneeError.message.includes('duplicate')) {
            console.error('Error creating assignee:', assigneeError);
            errorCount++;
            continue;
          }
        }

        // Mark pending as resolved
        const { error: updateError } = await supabase
          .from('import_pending_assignees')
          .update({
            mapped_user_id: userId,
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
          })
          .eq('id', pendingId);

        if (updateError) {
          console.error('Error updating pending:', updateError);
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Mappings applied',
          description: `Successfully mapped ${successCount} assignee(s).${errorCount > 0 ? ` ${errorCount} failed.` : ''}`,
        });
        setSelectedMappings({});
        loadData();
        onMappingComplete();
      } else if (errorCount > 0) {
        toast({
          title: 'Mapping failed',
          description: `Failed to apply ${errorCount} mapping(s).`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error applying mappings:', error);
      toast({
        title: 'Failed to apply mappings',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const applyMappingToAll = async (originalName: string, userId: string) => {
    const matchingPending = pendingAssignees.filter(
      p => p.original_member_name.toLowerCase() === originalName.toLowerCase()
    );

    const newMappings: Record<string, string> = {};
    for (const p of matchingPending) {
      newMappings[p.id] = userId;
    }

    setSelectedMappings(prev => ({
      ...prev,
      ...newMappings,
    }));

    toast({
      title: 'Mapping applied to all',
      description: `Selected ${matchingPending.length} card(s) for "${originalName}". Click "Apply Mappings" to save.`,
    });
  };

  const dismissPending = async (pendingId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('import_pending_assignees')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', pendingId);

      if (error) throw error;

      setPendingAssignees(prev => prev.filter(p => p.id !== pendingId));
      toast({ title: 'Dismissed', description: 'Pending assignee dismissed.' });
    } catch (error: any) {
      toast({
        title: 'Failed to dismiss',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const filteredUsers = workspaceUsers.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      (user.full_name?.toLowerCase() || '').includes(query)
    );
  });

  // Group pending assignees by board
  const groupedByBoard = pendingAssignees.reduce((acc, p) => {
    if (!acc[p.board_id]) {
      acc[p.board_id] = {
        board_id: p.board_id,
        board_name: p.board_name || 'Unknown Board',
        items: [],
      };
    }
    acc[p.board_id].items.push(p);
    return acc;
  }, {} as Record<string, { board_id: string; board_name: string; items: PendingAssignee[] }>);

  // Get unique original names for bulk mapping
  const uniqueOriginalNames = [...new Set(pendingAssignees.map(p => p.original_member_name))];

  const toggleBoard = (boardId: string) => {
    setExpandedBoards(prev => {
      const next = new Set(prev);
      if (next.has(boardId)) {
        next.delete(boardId);
      } else {
        next.add(boardId);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Map Imported Assignees
          </DialogTitle>
          <DialogDescription>
            Map imported member names to existing workspace users. Assignees from imports are listed below.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pendingAssignees.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>No pending assignee mappings.</p>
            <p className="text-sm">All imported members have been mapped or dismissed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* User Search */}
            <div className="space-y-2">
              <Label>Search Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Quick Bulk Mapping */}
            {uniqueOriginalNames.length > 1 && (
              <div className="rounded-md border p-3 bg-muted/50">
                <h4 className="font-medium text-sm mb-2">Quick Bulk Mapping</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Click a user to map all cards with that original member name.
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniqueOriginalNames.map(name => {
                    const count = pendingAssignees.filter(p => p.original_member_name === name).length;
                    return (
                      <Badge key={name} variant="secondary" className="text-xs">
                        {name} ({count})
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pending Assignees by Board */}
            <ScrollArea className="h-[350px] rounded-md border">
              <div className="p-4 space-y-3">
                {Object.values(groupedByBoard).map(group => (
                  <Collapsible
                    key={group.board_id}
                    open={expandedBoards.has(group.board_id)}
                    onOpenChange={() => toggleBoard(group.board_id)}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded-md">
                      {expandedBoards.has(group.board_id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium">{group.board_name}</span>
                      <Badge variant="outline" className="ml-auto">
                        {group.items.length} pending
                      </Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-6 space-y-2 mt-2">
                      {group.items.map(pending => (
                        <div
                          key={pending.id}
                          className="flex items-start gap-3 p-3 rounded-md border bg-background"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm truncate">
                                {pending.original_member_name}
                              </span>
                              {pending.original_username && (
                                <span className="text-xs text-muted-foreground">
                                  @{pending.original_username}
                                </span>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {pending.import_source}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              Card: {pending.card_title}
                            </p>
                            
                            {/* User Selection */}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {filteredUsers.slice(0, 5).map(user => (
                                <Button
                                  key={user.id}
                                  variant={selectedMappings[pending.id] === user.id ? 'default' : 'outline'}
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleMappingSelect(pending.id, user.id)}
                                >
                                  <Avatar className="h-4 w-4 mr-1">
                                    <AvatarImage src={user.avatar_url || undefined} />
                                    <AvatarFallback className="text-[8px]">
                                      {(user.full_name || user.email)[0]?.toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  {user.full_name || user.email.split('@')[0]}
                                </Button>
                              ))}
                              {filteredUsers.length > 5 && (
                                <span className="text-xs text-muted-foreground self-center ml-1">
                                  +{filteredUsers.length - 5} more (search to filter)
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            {uniqueOriginalNames.filter(n => n === pending.original_member_name).length > 0 && 
                             pendingAssignees.filter(p => p.original_member_name === pending.original_member_name).length > 1 &&
                             selectedMappings[pending.id] && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => applyMappingToAll(
                                  pending.original_member_name,
                                  selectedMappings[pending.id]
                                )}
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                Apply to all
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => dismissPending(pending.id)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>

            {/* Selected Mappings Summary */}
            {Object.keys(selectedMappings).length > 0 && (
              <div className="rounded-md border p-3 bg-primary/5">
                <p className="text-sm font-medium">
                  {Object.keys(selectedMappings).length} mapping(s) selected
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={applyMappings}
                disabled={Object.keys(selectedMappings).length === 0 || applying}
              >
                {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Apply Mappings ({Object.keys(selectedMappings).length})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
