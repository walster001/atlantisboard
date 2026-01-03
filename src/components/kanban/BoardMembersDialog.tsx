import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Trash2, UserPlus, User } from 'lucide-react';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { emailSchema } from '@/lib/validators';
import { z } from 'zod';
import { subscribeWorkspaceViaRegistry } from '@/realtime/workspaceSubscriptions';
import { useAuth } from '@/hooks/useAuth';

interface BoardMember {
  userId: string;
  role: 'admin' | 'manager' | 'viewer';
  profiles: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
}

interface BoardMembersDialogProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  workspaceId: string | null;
  members: BoardMember[];
  userRole: 'admin' | 'manager' | 'viewer' | null;
  onMembersChange: () => void;
}

export function BoardMembersDialog({
  open,
  onClose,
  boardId,
  workspaceId,
  members,
  userRole,
  onMembersChange,
}: BoardMembersDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'viewer'>('viewer');
  const [isAdding, setIsAdding] = useState(false);

  // Subscribe to realtime board member updates when dialog is open (using workspace subscription via registry)
  // Cleanup removes handlers but subscription persists via registry
  useEffect(() => {
    if (!open || !boardId || !workspaceId || !user) return;

    const cleanup = subscribeWorkspaceViaRegistry(workspaceId, {
      onMemberUpdate: (member, event) => {
        const membership = member as { boardId?: string };
        // Only process events for members in the current board
        if (membership.boardId !== boardId) return;
        
        // When a role is updated, refresh the members list
        // This ensures the UI reflects the new role immediately
        onMembersChange();
      },
    });

    return cleanup;
  }, [open, boardId, workspaceId, user, onMembersChange]);

  // Use permission system for UI checks
  // SECURITY NOTE: These do NOT provide security - all permissions
  // are enforced server-side via RLS policies. These checks only
  // hide UI elements to improve user experience.
  const { can, canChangeRoles, canManageMembers, isAppAdmin } = usePermissions(boardId, userRole);
  const canAddRemove = canManageMembers || isAppAdmin;
  
  // App Admins can always change roles (including their own) for self-management/testing
  const canChangeRolesEffective = canChangeRoles || isAppAdmin;

  const addMember = async () => {
    setIsAdding(true);

    try {
      // Validate email format
      const validEmail = emailSchema.parse(email);

      // Find user by email using secure RPC function
      const { data: profiles, error: profileError } = await api
        .rpc('find_user_by_email', { _email: validEmail, _board_id: boardId });

      if (profileError) throw profileError;
      
      // Type guard: ensure profiles is an array
      if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
        toast({ title: 'User not found', description: 'No user with that email exists.', variant: 'destructive' });
        setIsAdding(false);
        return;
      }
      
      const profile = profiles[0];

      // Check if already a member
      const existing = members.find(m => m.userId === profile.id);
      if (existing) {
        toast({ title: 'Already a member', description: 'This user is already a board member.', variant: 'destructive' });
        setIsAdding(false);
        return;
      }

      // Managers can only add viewers
      const assignRole = userRole === 'manager' ? 'viewer' : role;

      // Use proper API endpoint instead of generic db route
      const result = await api.request(`/boards/${boardId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: profile.id,
          role: assignRole,
        }),
      });

      if (result.error) throw result.error;

      toast({ title: 'Member added!' });
      setEmail('');
      onMembersChange();
    } catch (error: any) {
      console.error('Add member error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Invalid Email', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    } finally {
      setIsAdding(false);
    }
  };

  const removeMember = async (userId: string) => {
    try {
      // Use proper API endpoint instead of generic db route
      const result = await api.request(`/boards/${boardId}/members/${userId}`, {
        method: 'DELETE',
      });

      if (result.error) throw result.error;
      
      toast({ title: 'Member removed' });
      onMembersChange();
    } catch (error: any) {
      console.error('Remove member error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const updateRole = async (userId: string, newRole: 'admin' | 'manager' | 'viewer') => {
    // Early return for better UX (don't show loading states)
    // Server-side RLS will reject if user lacks permission
    // App Admins can always change roles for self-management/testing
    if (!canChangeRolesEffective) return;
    try {
      const result = await api.request(`/boards/${boardId}/members/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });

      if (result.error) throw result.error;
      toast({ title: 'Role updated' });
      onMembersChange();
    } catch (error: any) {
      console.error('Update role error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Board Members</DialogTitle>
        </DialogHeader>

        {canAddRemove && (
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMember()}
                maxLength={255}
              />
              {canChangeRolesEffective && (
                <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'manager' | 'viewer')}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button onClick={addMember} disabled={isAdding}>
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {userRole === 'manager' 
                ? 'As a Manager, you can only add Viewers.' 
                : 'Admin: full access • Manager: manage members only • Viewer: read-only'}
            </p>
          </div>
        )}

        <div className="space-y-2 pt-4">
          <Label>Current Members</Label>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.profiles.avatarUrl || undefined} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {member.profiles.fullName || member.profiles.email || 'Unknown User'}
                    </p>
                    {member.profiles.email && (
                      <p className="text-xs text-muted-foreground">{member.profiles.email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canChangeRolesEffective ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => updateRole(member.userId, v as 'admin' | 'manager' | 'viewer')}
                    >
                      <SelectTrigger className="w-24 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize px-2">
                      {member.role}
                    </span>
                  )}
                  {canAddRemove && members.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeMember(member.userId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
