import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, User, X, Search, UserMinus, Loader2, Palette, ImageIcon, Tag, Settings2, History } from 'lucide-react';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { ThemeSettings } from './ThemeSettings';
import { BoardBackgroundSettings } from './BoardBackgroundSettings';
import { BoardLabelsSettings } from './BoardLabelsSettings';
import { BoardMemberAuditLog } from './BoardMemberAuditLog';
import { cn } from '@/lib/utils';

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

interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface BoardTheme {
  id: string;
  name: string;
  navbar_color: string;
  column_color: string;
  default_card_color: string | null;
  homepage_board_color: string;
  board_icon_color: string;
  scrollbar_color: string;
  scrollbar_track_color: string;
}

interface BoardLabel {
  id: string;
  board_id: string;
  name: string;
  color: string;
}

interface BoardSettingsModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  members: BoardMember[];
  userRole: 'admin' | 'manager' | 'viewer' | null;
  currentUserId: string | null;
  currentThemeId: string | null;
  currentTheme: BoardTheme | null;
  currentBackgroundColor: string;
  currentBackgroundImageUrl: string | null;
  labels: BoardLabel[];
  onMembersChange: () => void;
  onThemeChange: () => void;
  onBackgroundChange: () => void;
  onLabelsChange: () => void;
}

const themeSubTabs = [
  { id: 'themes', label: 'Theme / Colouring', icon: Palette },
  { id: 'background', label: 'Background', icon: ImageIcon },
];

const boardSubTabs = [
  { id: 'card-settings', label: 'Card Settings', icon: Settings2 },
  { id: 'labels', label: 'Labels', icon: Tag },
];

export function BoardSettingsModal({
  open,
  onClose,
  boardId,
  members,
  userRole,
  currentUserId,
  currentThemeId,
  currentTheme,
  currentBackgroundColor,
  currentBackgroundImageUrl,
  labels,
  onMembersChange,
  onThemeChange,
  onBackgroundChange,
  onLabelsChange,
}: BoardSettingsModalProps) {
  const { toast } = useToast();
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [userToRemove, setUserToRemove] = useState<{ id: string; name: string } | null>(null);
  const [activeThemeSubTab, setActiveThemeSubTab] = useState('themes');
  const [activeBoardSubTab, setActiveBoardSubTab] = useState('labels');
  const [pendingRoles, setPendingRoles] = useState<Record<string, 'admin' | 'manager' | 'viewer'>>({});

  // SECURITY: Role-based access - these control what the user sees
  // Real security is enforced server-side via RLS policies
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const isViewer = userRole === 'viewer';
  
  // Viewers should never see this modal - close immediately if opened
  // This is a defense-in-depth measure; the button should already be hidden
  const hasAccess = isAdmin || isManager;
  
  // Permission checks for specific actions
  const canChangeRoles = isAdmin; // Only admins can change roles
  const canAddRemove = isAdmin || isManager; // Admins and managers can add/remove members
  const canAccessBoardSettings = isAdmin; // Only admins can access Board Settings tab
  const canAccessThemeSettings = isAdmin; // Only admins can access Theme & Background tab

  // Fetch all users when modal opens
  useEffect(() => {
    if (open && canAddRemove) {
      fetchAllUsers();
    }
  }, [open, canAddRemove]);

  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .order('full_name', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Get member IDs for quick lookup
  const memberIds = new Set(members.map(m => m.user_id));

  // Filter non-member users based on search
  const filteredNonMembers = allUsers.filter((user) => {
    if (memberIds.has(user.id)) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = user.full_name?.toLowerCase() || '';
    const email = user.email?.toLowerCase() || '';
    return name.includes(query) || email.includes(query);
  });

  // Filter current members based on search
  const filteredMembers = members.filter((member) => {
    if (!memberSearchQuery.trim()) return true;
    const query = memberSearchQuery.toLowerCase();
    const name = member.profiles.full_name?.toLowerCase() || '';
    const email = member.profiles.email?.toLowerCase() || '';
    return name.includes(query) || email.includes(query);
  });

  const addMember = async (userId: string) => {
    setAddingUserId(userId);
    try {
      const assignRole = userRole === 'manager' ? 'viewer' : (pendingRoles[userId] || 'viewer');

      const { error } = await supabase.from('board_members').insert({
        board_id: boardId,
        user_id: userId,
        role: assignRole,
      });

      if (error) throw error;
      
      // Broadcast to the board channel for existing members to update their list
      const boardChannel = supabase.channel(`board-${boardId}-member-changes`);
      
      // Wait for subscription to be ready before sending
      await new Promise<void>((resolve) => {
        boardChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve();
          }
        });
      });
      
      await boardChannel.send({
        type: 'broadcast',
        event: 'member_added',
        payload: { 
          board_id: boardId, 
          user_id: userId,
          role: assignRole,
          added_by: currentUserId 
        }
      });
      supabase.removeChannel(boardChannel);
      
      // Also broadcast to user-specific channel so the added user gets notified
      const userChannel = supabase.channel(`user-${userId}-board-updates`);
      
      // Wait for subscription to be ready before sending
      await new Promise<void>((resolve) => {
        userChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve();
          }
        });
      });
      
      await userChannel.send({
        type: 'broadcast',
        event: 'added_to_board',
        payload: { 
          board_id: boardId, 
          role: assignRole,
          added_by: currentUserId 
        }
      });
      supabase.removeChannel(userChannel);
      
      toast({ title: 'Member added!' });
      onMembersChange();
    } catch (error: any) {
      console.error('Add member error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setAddingUserId(null);
    }
  };

  // Count admins on the board
  const adminCount = members.filter(m => m.role === 'admin').length;

  const confirmRemoveMember = (userId: string, name: string) => {
    const memberToRemove = members.find(m => m.user_id === userId);
    
    // SECURITY: Managers cannot remove admins or other managers
    if (isManager && memberToRemove && (memberToRemove.role === 'admin' || memberToRemove.role === 'manager')) {
      toast({ 
        title: 'Cannot remove this member', 
        description: 'As a Manager, you can only remove Viewers from the board.',
        variant: 'destructive' 
      });
      return;
    }
    
    // Check if user is trying to remove themselves and they're the last admin
    const isLastAdmin = memberToRemove?.role === 'admin' && adminCount === 1;
    
    if (userId === currentUserId && isLastAdmin) {
      toast({ 
        title: 'Cannot remove yourself', 
        description: 'You are the last admin on this board. At least one admin must remain. Please assign another admin before removing yourself.',
        variant: 'destructive' 
      });
      return;
    }
    
    setUserToRemove({ id: userId, name });
  };

  const removeMember = async () => {
    if (!userToRemove) return;
    setRemovingUserId(userToRemove.id);
    try {
      const { error } = await supabase
        .from('board_members')
        .delete()
        .eq('board_id', boardId)
        .eq('user_id', userToRemove.id);

      if (error) throw error;
      
      // Broadcast member removal event so the removed user gets notified instantly
      const channel = supabase.channel(`board-${boardId}-member-changes`);
      
      // Wait for subscription to be ready before sending
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          console.log('BoardSettingsModal: Broadcast channel status:', status);
          if (status === 'SUBSCRIBED') {
            resolve();
          }
        });
      });
      
      console.log('BoardSettingsModal: Sending member_removed broadcast for user:', userToRemove.id);
      await channel.send({
        type: 'broadcast',
        event: 'member_removed',
        payload: { 
          board_id: boardId, 
          user_id: userToRemove.id,
          removed_by: currentUserId 
        }
      });
      console.log('BoardSettingsModal: Broadcast sent successfully');
      
      supabase.removeChannel(channel);
      
      toast({ title: 'Member removed' });
      onMembersChange();
    } catch (error: any) {
      console.error('Remove member error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setRemovingUserId(null);
      setUserToRemove(null);
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

  // SECURITY: Viewers should never access this modal
  // Close immediately if somehow opened (defense-in-depth)
  useEffect(() => {
    if (open && !hasAccess) {
      onClose();
    }
  }, [open, hasAccess, onClose]);

  // Don't render anything if user doesn't have access
  if (!hasAccess) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent 
          className="max-w-4xl w-[95vw] h-[85vh] max-h-[85vh] p-0 overflow-hidden rounded-lg flex flex-col gap-0"
          hideCloseButton
        >
          {/* Custom header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="text-lg font-semibold">
              {isManager ? 'Board Members' : 'Board Settings'}
            </h2>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabs - Only show tabs if user is admin; managers only see members content */}
          <Tabs defaultValue="users" className="flex flex-col flex-1 min-h-0">
            {/* Only show tab list for admins - managers only have access to users tab */}
            {isAdmin && (
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0 px-4 shrink-0">
                {canAccessBoardSettings && (
                  <TabsTrigger 
                    value="board" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-4"
                  >
                    Board Settings
                  </TabsTrigger>
                )}
                <TabsTrigger 
                  value="users" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-4"
                >
                  Users & Permissions
                </TabsTrigger>
                {canAccessThemeSettings && (
                  <TabsTrigger 
                    value="theme" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-4"
                  >
                    Theme & Background
                  </TabsTrigger>
                )}
                <TabsTrigger 
                  value="audit" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-4"
                >
                  <History className="h-4 w-4 mr-1.5" />
                  Audit Log
                </TabsTrigger>
              </TabsList>
            )}

            {/* Board Settings Tab - Only render for admins */}
            {canAccessBoardSettings && (
              <TabsContent value="board" className="flex-1 mt-0 data-[state=inactive]:hidden flex min-h-0">
                {/* Vertical sub-navigation */}
                <aside className="w-48 bg-muted/30 border-r border-border p-3 shrink-0">
                  <nav className="space-y-1">
                    {boardSubTabs.map((subTab) => {
                      const Icon = subTab.icon;
                      return (
                        <button
                          key={subTab.id}
                          onClick={() => setActiveBoardSubTab(subTab.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                            activeBoardSubTab === subTab.id
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {subTab.label}
                        </button>
                      );
                    })}
                  </nav>
                </aside>

                {/* Sub-tab content */}
                <div className="flex-1 p-4 overflow-y-auto">
                  {activeBoardSubTab === 'card-settings' && (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Card settings coming soon...</p>
                    </div>
                  )}
                  {activeBoardSubTab === 'labels' && (
                    <BoardLabelsSettings
                      boardId={boardId}
                      labels={labels}
                      onLabelsChange={onLabelsChange}
                      disabled={!isAdmin}
                    />
                  )}
                </div>
              </TabsContent>
            )}

            {/* Users & Permissions Tab */}
            <TabsContent value="users" className="flex-1 p-4 overflow-y-auto mt-0 data-[state=inactive]:hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                {/* All Users Section - Add to Board */}
                {canAddRemove && (
                  <div className="flex flex-col min-h-0">
                    <Label className="text-base font-medium mb-3">All Users</Label>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users to add..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {userRole === 'manager' 
                        ? 'As a Manager, you can only add Viewers.' 
                        : 'Select a role and add users to this board.'}
                    </p>
                    <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
                      {loadingUsers ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : filteredNonMembers.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          {searchQuery ? 'No users match your search.' : 'All users are already members.'}
                        </p>
                      ) : (
                        <div className="divide-y">
                          {filteredNonMembers.map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Avatar className="h-9 w-9 shrink-0">
                                  <AvatarImage src={user.avatar_url || undefined} />
                                  <AvatarFallback>
                                    <User className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">
                                    {user.full_name || 'Unknown User'}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Role selector for new members - Admins get full control */}
                                {isAdmin ? (
                                  <Select 
                                    value={pendingRoles[user.id] || 'viewer'} 
                                    onValueChange={(v) => setPendingRoles(prev => ({ ...prev, [user.id]: v as 'admin' | 'manager' | 'viewer' }))}
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
                                ) : isManager ? (
                                  // Managers can only add viewers - show greyed-out options
                                  <Select 
                                    value="viewer" 
                                    disabled
                                  >
                                    <SelectTrigger className="w-24 h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem 
                                        value="admin" 
                                        disabled 
                                        className="text-muted-foreground opacity-50"
                                      >
                                        Admin
                                      </SelectItem>
                                      <SelectItem 
                                        value="manager" 
                                        disabled 
                                        className="text-muted-foreground opacity-50"
                                      >
                                        Manager
                                      </SelectItem>
                                      <SelectItem value="viewer">Viewer</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : null}
                                <Button 
                                  size="sm" 
                                  onClick={() => addMember(user.id)}
                                  disabled={addingUserId === user.id}
                                  className="h-8"
                                >
                                  {addingUserId === user.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <UserPlus className="h-4 w-4 mr-1" />
                                      Add
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Current Members Section */}
                <div className={`flex flex-col min-h-0 ${!canAddRemove ? 'lg:col-span-2' : ''}`}>
                  <Label className="text-base font-medium mb-3">
                    Current Members ({members.length})
                  </Label>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
                    {filteredMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {memberSearchQuery ? 'No members match your search.' : 'No members found.'}
                      </p>
                    ) : (
                      <div className="divide-y">
                        {filteredMembers.map((member) => (
                          <div
                            key={member.user_id}
                            className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage src={member.profiles.avatar_url || undefined} />
                                <AvatarFallback>
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">
                                  {member.profiles.full_name || member.profiles.email || 'Unknown User'}
                                </p>
                                {member.profiles.email && (
                                  <p className="text-xs text-muted-foreground truncate">{member.profiles.email}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Role selector - Admins get full control, Managers see restricted options */}
                              {isAdmin ? (
                                <Select
                                  value={member.role}
                                  onValueChange={(v) => updateRole(member.user_id, v as 'admin' | 'manager' | 'viewer')}
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
                              ) : isManager ? (
                                // Managers see role with restricted options greyed out
                                <Select
                                  value={member.role}
                                  onValueChange={(v) => {
                                    // Managers can only change to viewer (demote)
                                    if (v === 'viewer' && member.role === 'viewer') return;
                                    // Managers cannot promote anyone (including themselves)
                                    if (v !== 'viewer') return;
                                    updateRole(member.user_id, 'viewer');
                                  }}
                                  disabled={member.role === 'admin' || member.role === 'manager'}
                                >
                                  <SelectTrigger className="w-24 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem 
                                      value="admin" 
                                      disabled 
                                      className="text-muted-foreground opacity-50"
                                    >
                                      Admin
                                    </SelectItem>
                                    <SelectItem 
                                      value="manager" 
                                      disabled 
                                      className="text-muted-foreground opacity-50"
                                    >
                                      Manager
                                    </SelectItem>
                                    <SelectItem value="viewer">Viewer</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground capitalize px-2 py-1 bg-muted rounded">
                                  {member.role}
                                </span>
                              )}
                              {/* Remove button - Managers can only remove viewers */}
                              {canAddRemove && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-8",
                                    // Grey out for managers viewing admins/managers
                                    isManager && (member.role === 'admin' || member.role === 'manager')
                                      ? "text-muted-foreground/50 cursor-not-allowed"
                                      : "text-destructive hover:text-destructive hover:bg-destructive/10"
                                  )}
                                  onClick={() => confirmRemoveMember(
                                    member.user_id, 
                                    member.profiles.full_name || member.profiles.email || 'this user'
                                  )}
                                  disabled={
                                    removingUserId === member.user_id || 
                                    (isManager && (member.role === 'admin' || member.role === 'manager'))
                                  }
                                  title={
                                    isManager && (member.role === 'admin' || member.role === 'manager')
                                      ? 'Managers can only remove Viewers'
                                      : 'Remove member'
                                  }
                                >
                                  {removingUserId === member.user_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <UserMinus className="h-4 w-4 mr-1" />
                                      Remove
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Theme & Background Tab - Only render for admins */}
            {canAccessThemeSettings && (
              <TabsContent value="theme" className="flex-1 mt-0 data-[state=inactive]:hidden flex min-h-0">
                {/* Vertical sub-navigation */}
                <aside className="w-48 bg-muted/30 border-r border-border p-3 shrink-0">
                  <nav className="space-y-1">
                    {themeSubTabs.map((subTab) => {
                      const Icon = subTab.icon;
                      return (
                        <button
                          key={subTab.id}
                          onClick={() => setActiveThemeSubTab(subTab.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                            activeThemeSubTab === subTab.id
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {subTab.label}
                        </button>
                      );
                    })}
                  </nav>
                </aside>

                {/* Sub-tab content */}
                <div className="flex-1 p-4 overflow-y-auto">
                  {activeThemeSubTab === 'themes' && (
                    <ThemeSettings
                      boardId={boardId}
                      currentThemeId={currentThemeId}
                      userRole={userRole}
                      onThemeApplied={onThemeChange}
                    />
                  )}
                  {activeThemeSubTab === 'background' && (
                    <BoardBackgroundSettings
                      boardId={boardId}
                      currentBackgroundColor={currentBackgroundColor}
                      currentBackgroundImageUrl={currentBackgroundImageUrl}
                      currentTheme={currentTheme}
                      userRole={userRole}
                      onBackgroundChange={onBackgroundChange}
                    />
                  )}
                </div>
              </TabsContent>
            )}

            {/* Audit Log Tab - Only for admins */}
            {isAdmin && (
              <TabsContent value="audit" className="flex-1 p-4 overflow-y-auto mt-0 data-[state=inactive]:hidden">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Member Activity Log
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Track who added, removed, or changed roles for board members
                    </p>
                  </div>
                  <BoardMemberAuditLog boardId={boardId} userRole={userRole} />
                </div>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={!!userToRemove} onOpenChange={(open) => !open && setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{userToRemove?.name}</strong> from this board? 
              They will lose access to all board content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={removeMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
