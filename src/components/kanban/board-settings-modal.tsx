import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { UserPlus, User, X, Search, UserMinus, Loader2, Palette, ImageIcon, Tag, Settings2, History } from 'lucide-react';
import { getUserFriendlyError, getErrorMessage } from '@/lib/errorHandler';
import { ThemeSettings } from './theme-settings';
import { BoardBackgroundSettings } from './board-background-settings';
import { BoardLabelsSettings } from './board-labels-settings';
import { BoardMemberAuditLog } from './board-member-audit-log';
import { cn } from '@/lib/utils';
import { subscribeWorkspaceViaRegistry } from '@/realtime/workspaceSubscriptions';
import { useStableRealtimeHandlers } from '@/hooks/useStableRealtimeHandlers';

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

interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

interface BoardTheme {
  id: string;
  name: string;
  navbarColor: string;
  columnColor: string;
  defaultCardColor: string | null;
  homepageBoardColor: string;
  boardIconColor: string;
  scrollbarColor: string;
  scrollbarTrackColor: string;
}

interface BoardLabel {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

interface BoardSettingsModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  workspaceId: string | null;
  members: BoardMember[];
  userRole: 'admin' | 'manager' | 'viewer' | null;
  currentUserId: string | null;
  boardCreatedBy: string | null;
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
  workspaceId,
  members,
  userRole,
  currentUserId,
  boardCreatedBy,
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

  // Use permission system for UI checks
  // SECURITY: Real security is enforced server-side via RLS policies
  const { can, canEdit, canManageMembers, canChangeRoles: canChangeRolesPermission, isAppAdmin } = usePermissions(boardId, userRole);
  
  // App Admin overrides all board-level role checks
  const isBoardAdmin = userRole === 'admin';
  const isManager = userRole === 'manager' && !isAppAdmin;
  const isViewer = userRole === 'viewer' && !isAppAdmin;
  
  // Effective admin status: App Admin OR Board Admin
  const hasAdminCapabilities = isAppAdmin || isBoardAdmin;
  
  // Viewers should never see this modal - close immediately if opened
  // This is a defense-in-depth measure; the button should already be hidden
  const hasAccess = can('board.settings.button');
  
  // Permission checks for specific actions - App Admin bypasses all
  const canChangeRoles = isAppAdmin || canChangeRolesPermission || can('board.members.role.change');
  const canAddRemove = isAppAdmin || canManageMembers || can('board.members.add');
  const canAccessBoardSettings = isAppAdmin || can('board.settings.labels') || can('board.settings.audit');
  const canAccessThemeSettings = isAppAdmin || can('board.settings.theme');

  // Fetch all users when modal opens
  useEffect(() => {
    if (open && canAddRemove) {
      fetchAllUsers();
    }
  }, [open, canAddRemove]);

  // Refresh all users when members list changes (e.g., after add/remove)
  // This ensures removed members appear in "All Users" panel
  useEffect(() => {
    if (open && canAddRemove) {
      fetchAllUsers();
    }
  }, [members.length, open, canAddRemove]);

  // Create stable handlers for member updates
  const stableHandlers = useStableRealtimeHandlers({
    onMemberUpdate: (member, event) => {
      const membership = member as { boardId?: string; userId?: string; role?: string; user?: { profile?: { fullName?: string | null; email?: string } } };
      // Only process events for members in the current board
      if (membership.boardId !== boardId) return;
      
      if (event.eventType === 'INSERT') {
        const newMembership = membership;
        onMembersChange();
        if (newMembership.userId && newMembership.userId !== currentUserId) {
          const memberName = newMembership.user?.profile?.fullName || 
                            newMembership.user?.profile?.email || 
                            'a member';
          const role = newMembership.role || 'viewer';
          toast({
            title: 'Member added',
            description: `${memberName} added as ${role}`,
          });
        }
      } else if (event.eventType === 'DELETE') {
        const deletedMembership = membership;
        onMembersChange();
        if (deletedMembership.userId && deletedMembership.userId !== currentUserId) {
          const memberName = deletedMembership.user?.profile?.fullName || 
                            deletedMembership.user?.profile?.email || 
                            'a member';
          toast({
            title: 'Member removed',
            description: `${memberName} removed from board`,
          });
        }
      } else if (event.eventType === 'UPDATE') {
        const updatedMembership = membership;
        const previousMembership = event.old as { role?: string };
        onMembersChange();
        
        // Only show toast if it's not the current user (they already see their own action in the UI)
        // This prevents duplicate toasts when BoardPage also shows a toast
        if (updatedMembership.userId && updatedMembership.userId !== currentUserId) {
          const memberName = updatedMembership.user?.profile?.fullName || 
                            updatedMembership.user?.profile?.email || 
                            'a member';
          const newRole = updatedMembership.role || 'viewer';
          const oldRole = previousMembership?.role || 'viewer';
          toast({
            title: 'Role updated',
            description: `${memberName} role changed from ${oldRole} to ${newRole}`,
          });
        }
      }
    },
  }, [boardId, onMembersChange, toast, currentUserId]);

  // Subscribe to realtime board member changes when modal is open (using workspace subscription via registry)
  // Cleanup removes handlers but subscription persists via registry
  useEffect(() => {
    if (!open || !boardId || !workspaceId) return;

    const cleanup = subscribeWorkspaceViaRegistry(workspaceId, stableHandlers);

    return () => {
      cleanup();
      // Cleanup function from stableHandlers will process pending batches
      if (stableHandlers.__cleanup) {
        stableHandlers.__cleanup();
      }
    };
  }, [open, boardId, workspaceId, stableHandlers]);

  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await api
        .from('profiles')
        .select('id, email, fullName, avatarUrl')
        .order('fullName', { ascending: true });

      if (error) throw error;
      setAllUsers((data as AppUser[]) || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Get member IDs for quick lookup
  const memberIds = new Set(members.map(m => m.userId));

  // Filter non-member users based on search
  const filteredNonMembers = allUsers.filter((user) => {
    if (memberIds.has(user.id)) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = user.fullName?.toLowerCase() || '';
    const email = user.email?.toLowerCase() || '';
    return name.includes(query) || email.includes(query);
  });

  // Filter current members based on search
  const filteredMembers = members.filter((member) => {
    if (!memberSearchQuery.trim()) return true;
    const query = memberSearchQuery.toLowerCase();
    const name = member.profiles?.fullName?.toLowerCase() || '';
    const email = member.profiles?.email?.toLowerCase() || '';
    return name.includes(query) || email.includes(query);
  });

  const addMember = async (userId: string) => {
    setAddingUserId(userId);
    try {
      const assignRole = userRole === 'manager' ? 'viewer' : (pendingRoles[userId] || 'viewer');

      // Use proper API endpoint instead of generic db route
      const result = await api.request(`/boards/${boardId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId,
          role: assignRole,
        }),
      });

      if (result.error) throw result.error;
      
      // Member addition is detected via postgres_changes - no broadcast needed
      
      toast({ title: 'Member added!' });
      
      // Refresh members list to ensure UI updates correctly
      onMembersChange();
      
      // Clear pending role for this user
      setPendingRoles(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (error: unknown) {
      console.error('Add member error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setAddingUserId(null);
    }
  };

  // Count admins on the board
  const adminCount = members.filter(m => m.role === 'admin').length;

  const confirmRemoveMember = (userId: string, name: string) => {
    const memberToRemove = members.find(m => m.userId === userId);
    
    // Rule 1: Board creator cannot be removed by anyone (including self)
    if (boardCreatedBy && userId === boardCreatedBy) {
      toast({ 
        title: 'Cannot remove board creator', 
        description: 'The board creator cannot be removed from the board. Delete the board to remove access.',
        variant: 'destructive' 
      });
      return;
    }
    
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
    
    // Verify the member still exists in the current members list before attempting removal
    // This prevents attempting to remove a member that was already removed (stale UI state)
    const memberStillExists = members.some(m => m.userId === userToRemove.id);
    if (!memberStillExists) {
      // Member no longer exists - refresh and close dialog
      toast({ 
        title: 'Member already removed', 
        description: 'This member has already been removed from the board.',
        variant: 'destructive' 
      });
      setUserToRemove(null);
      onMembersChange(); // Refresh to ensure UI is up to date
      return;
    }
    
    setRemovingUserId(userToRemove.id);
    try {
      // Use proper API endpoint instead of generic db route
      const result = await api.request(`/boards/${boardId}/members/${userToRemove.id}`, {
        method: 'DELETE',
      });

      if (result.error) throw result.error;
      
      // Member removal is detected via postgres_changes in BoardPage
      // No need for broadcast - the realtime subscription handles it
      
      toast({ title: 'Member removed' });
      
      // Refresh members list and all users list to ensure UI updates correctly
      onMembersChange();
      fetchAllUsers();
    } catch (error: unknown) {
      console.error('Remove member error:', error);
      // If member not found, refresh the members list to sync UI with backend state
      const errorMessage = getErrorMessage(error);
      if (errorMessage.includes('not found') || errorMessage.includes('Not found')) {
        onMembersChange(); // Refresh members list to sync UI with backend
        toast({ 
          title: 'Member not found', 
          description: 'The member may have already been removed. Refreshing the list...',
          variant: 'destructive' 
        });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    } finally {
      setRemovingUserId(null);
      setUserToRemove(null);
    }
  };

  const updateRole = async (userId: string, newRole: 'admin' | 'manager' | 'viewer') => {
    if (!canChangeRoles) return;
    try {
      // Use proper API endpoint instead of generic db route
      const result = await api.request(`/boards/${boardId}/members/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });

      if (result.error) throw result.error;
      toast({ title: 'Role updated' });
      onMembersChange();
    } catch (error: unknown) {
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
              {isManager && !hasAdminCapabilities ? 'Board Members' : 'Board Settings'}
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

          {/* Tabs - Only show tabs if user has admin capabilities; managers only see members content */}
          <Tabs defaultValue="users" className="flex flex-col flex-1 min-h-0">
            {/* Only show tab list for users with admin capabilities */}
            {hasAdminCapabilities && (
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

            {/* Board Settings Tab - Only render for users with admin capabilities */}
            {canAccessBoardSettings && hasAdminCapabilities && (
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
                      disabled={!hasAdminCapabilities}
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
                      {isManager && !hasAdminCapabilities
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
                                  <AvatarImage src={user.avatarUrl || undefined} />
                                  <AvatarFallback>
                                    <User className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">
                                    {user.fullName || 'Unknown User'}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Role selector for new members - Admin-capable users get full control */}
                                {hasAdminCapabilities ? (
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
                            key={member.userId}
                            className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage src={member.profiles?.avatarUrl || undefined} />
                                <AvatarFallback>
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">
                                  {member.profiles?.fullName || member.profiles?.email || 'Unknown User'}
                                </p>
                                {member.profiles?.email && (
                                  <p className="text-xs text-muted-foreground truncate">{member.profiles.email}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Role selector - Admin-capable users get full control, Managers see restricted options */}
                              {hasAdminCapabilities ? (
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
                              ) : isManager ? (
                                // Managers see role with restricted options greyed out
                                <Select
                                  value={member.role}
                                  onValueChange={(v) => {
                                    // Managers can only change to viewer (demote)
                                    if (v === 'viewer' && member.role === 'viewer') return;
                                    // Managers cannot promote anyone (including themselves)
                                    if (v !== 'viewer') return;
                                    updateRole(member.userId, 'viewer');
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
                              {/* Remove button - Managers can only remove viewers, creator cannot be removed */}
                              {canAddRemove && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-8",
                                    // Grey out for managers viewing admins/managers, or for board creator
                                    (isManager && (member.role === 'admin' || member.role === 'manager')) ||
                                    (boardCreatedBy && member.userId === boardCreatedBy)
                                      ? "text-muted-foreground/50 cursor-not-allowed"
                                      : "text-destructive hover:text-destructive hover:bg-destructive/10"
                                  )}
                                  onClick={() => confirmRemoveMember(
                                    member.userId, 
                                    member.profiles?.fullName || member.profiles?.email || 'this user'
                                  )}
                                  disabled={
                                    removingUserId === member.userId || 
                                    (isManager && (member.role === 'admin' || member.role === 'manager')) ||
                                    (boardCreatedBy && member.userId === boardCreatedBy)
                                  }
                                  title={
                                    boardCreatedBy && member.userId === boardCreatedBy
                                      ? 'Board creator cannot be removed'
                                      : isManager && (member.role === 'admin' || member.role === 'manager')
                                      ? 'Managers can only remove Viewers'
                                      : 'Remove member'
                                  }
                                >
                                  {removingUserId === member.userId ? (
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

            {/* Audit Log Tab - Only for users with admin capabilities */}
            {hasAdminCapabilities && (
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
