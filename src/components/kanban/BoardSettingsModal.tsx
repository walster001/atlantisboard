import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Trash2, UserPlus, User, X, Search } from 'lucide-react';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { emailSchema } from '@/lib/validators';
import { z } from 'zod';

interface BoardMember {
  user_id: string;
  role: 'admin' | 'manager' | 'viewer';
  profiles: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface BoardSettingsModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  members: BoardMember[];
  userRole: 'admin' | 'manager' | 'viewer' | null;
  onMembersChange: () => void;
}

export function BoardSettingsModal({
  open,
  onClose,
  boardId,
  members,
  userRole,
  onMembersChange,
}: BoardSettingsModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'viewer'>('viewer');
  const [isAdding, setIsAdding] = useState(false);

  // UI-only permission checks for better UX
  // SECURITY NOTE: These do NOT provide security - all permissions
  // are enforced server-side via RLS policies.
  const canChangeRoles = userRole === 'admin';
  const canAddRemove = userRole === 'admin' || userRole === 'manager';

  // Filter members based on search query
  const filteredMembers = members.filter((member) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = member.profiles.full_name?.toLowerCase() || '';
    const email = member.profiles.email?.toLowerCase() || '';
    return name.includes(query) || email.includes(query);
  });

  const addMember = async () => {
    setIsAdding(true);

    try {
      const validEmail = emailSchema.parse(email);

      const { data: profiles, error: profileError } = await supabase
        .rpc('find_user_by_email', { _email: validEmail, _board_id: boardId });

      if (profileError) throw profileError;
      if (!profiles || profiles.length === 0) {
        toast({ title: 'User not found', description: 'No user with that email exists.', variant: 'destructive' });
        setIsAdding(false);
        return;
      }
      
      const profile = profiles[0];

      const existing = members.find(m => m.user_id === profile.id);
      if (existing) {
        toast({ title: 'Already a member', description: 'This user is already a board member.', variant: 'destructive' });
        setIsAdding(false);
        return;
      }

      const assignRole = userRole === 'manager' ? 'viewer' : role;

      const { error } = await supabase.from('board_members').insert({
        board_id: boardId,
        user_id: profile.id,
        role: assignRole,
      });

      if (error) throw error;

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
      const { error } = await supabase
        .from('board_members')
        .delete()
        .eq('board_id', boardId)
        .eq('user_id', userId);

      if (error) throw error;
      toast({ title: 'Member removed' });
      onMembersChange();
    } catch (error: any) {
      console.error('Remove member error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const updateRole = async (userId: string, newRole: 'admin' | 'manager' | 'viewer') => {
    if (!canChangeRoles) return;
    try {
      const { error } = await supabase
        .from('board_members')
        .update({ role: newRole })
        .eq('board_id', boardId)
        .eq('user_id', userId);

      if (error) throw error;
      toast({ title: 'Role updated' });
      onMembersChange();
    } catch (error: any) {
      console.error('Update role error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl w-[95vw] h-[85vh] max-h-[85vh] p-0 overflow-hidden rounded-lg flex flex-col gap-0"
        hideCloseButton
      >
        {/* Custom header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-lg font-semibold">Board Settings</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="flex flex-col flex-1 min-h-0">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0 px-4 shrink-0">
            <TabsTrigger 
              value="board" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-4"
            >
              Board Settings
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-4"
            >
              Users & Permissions
            </TabsTrigger>
            <TabsTrigger 
              value="theme" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-4"
            >
              Theme & Background
            </TabsTrigger>
          </TabsList>

          {/* Board Settings Tab - Placeholder */}
          <TabsContent value="board" className="flex-1 p-4 overflow-y-auto mt-0 data-[state=inactive]:hidden">
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Board settings coming soon...</p>
            </div>
          </TabsContent>

          {/* Users & Permissions Tab */}
          <TabsContent value="users" className="flex-1 p-4 overflow-y-auto mt-0 data-[state=inactive]:hidden">
            <div className="space-y-6 max-w-2xl">
              {/* Add Member Section */}
              {canAddRemove && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Add Member</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addMember()}
                      maxLength={255}
                      className="flex-1"
                    />
                    {canChangeRoles && (
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
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {userRole === 'manager' 
                      ? 'As a Manager, you can only add Viewers.' 
                      : 'Admin: full access • Manager: manage members only • Viewer: read-only'}
                  </p>
                </div>
              )}

              {/* Current Members Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Current Members ({members.length})</Label>
                </div>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search members..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Members List */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {searchQuery ? 'No members match your search.' : 'No members found.'}
                    </p>
                  ) : (
                    filteredMembers.map((member) => (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={member.profiles.avatar_url || undefined} />
                            <AvatarFallback>
                              <User className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {member.profiles.full_name || member.profiles.email || 'Unknown User'}
                            </p>
                            {member.profiles.email && (
                              <p className="text-sm text-muted-foreground">{member.profiles.email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canChangeRoles ? (
                            <Select
                              value={member.role}
                              onValueChange={(v) => updateRole(member.user_id, v as 'admin' | 'manager' | 'viewer')}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-muted-foreground capitalize px-3 py-1 bg-muted rounded">
                              {member.role}
                            </span>
                          )}
                          {canAddRemove && members.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => removeMember(member.user_id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Theme & Background Tab - Placeholder */}
          <TabsContent value="theme" className="flex-1 p-4 overflow-y-auto mt-0 data-[state=inactive]:hidden">
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Theme and background settings coming soon...</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
