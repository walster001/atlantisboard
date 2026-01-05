/**
 * App Admin User List Component
 * Shows current App Admins with option to add new ones via searchable dialog
 */

import { useState, useEffect, useMemo } from 'react';
import { Shield, Loader2, Plus, Search, X, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/integrations/api/client';

interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

interface AppAdminUserListProps {
  loading: boolean;
  onRefresh: () => void;
}

export function AppAdminUserList({ loading, onRefresh }: AppAdminUserListProps) {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    user: UserProfile | null;
    action: 'add' | 'remove';
  }>({ open: false, user: null, action: 'add' });
  const [saving, setSaving] = useState(false);

  // Current app admins
  const currentAdmins = useMemo(
    () => allUsers.filter(u => u.isAdmin),
    [allUsers]
  );

  // Non-admin users for the add dialog, filtered by search
  const nonAdminUsers = useMemo(() => {
    const nonAdmins = allUsers.filter(u => !u.isAdmin);
    if (!searchQuery.trim()) return nonAdmins;
    
    const query = searchQuery.toLowerCase();
    return nonAdmins.filter(u =>
      u.email.toLowerCase().includes(query) ||
      (u.fullName?.toLowerCase() || '').includes(query)
    );
  }, [allUsers, searchQuery]);

  const adminCount = currentAdmins.length;

  useEffect(() => {
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await api
        .from('profiles')
        .select('id, email, fullName, avatarUrl, isAdmin')
        .order('fullName', { ascending: true });

      if (error) throw error;
      setAllUsers((data as UserProfile[]) || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRemoveClick = (userProfile: UserProfile) => {
    setConfirmDialog({ open: true, user: userProfile, action: 'remove' });
  };

  const handleAddClick = (userProfile: UserProfile) => {
    setConfirmDialog({ open: true, user: userProfile, action: 'add' });
  };

  const handleConfirm = async () => {
    const { user: targetUser, action } = confirmDialog;
    if (!targetUser) return;

    setSaving(true);
    try {
      const newAdminStatus = action === 'add';
      const { error } = await api
        .from('profiles')
        .eq('id', targetUser.id)
        .update({ isAdmin: newAdminStatus });

      if (error) throw error;

      const displayName = targetUser.fullName || targetUser.email;
      
      // Update local state immediately for instant UI feedback
      setAllUsers(prev => prev.map(u => 
        u.id === targetUser.id ? { ...u, isAdmin: newAdminStatus } : u
      ));
      
      if (action === 'add') {
        toast.success(`${displayName} is now an App Admin`);
        setAddDialogOpen(false);
        setSearchQuery('');
      } else {
        toast.success(`${displayName} is no longer an App Admin`);
      }

      setConfirmDialog({ open: false, user: null, action: 'add' });
      onRefresh();
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast.error('Failed to update App Admin status');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  const isRemoveDisabled = (userProfile: UserProfile) => {
    const isSelf = userProfile.id === user?.id;
    const isLastAdmin = adminCount <= 1;
    return isSelf || isLastAdmin;
  };

  const getTooltipMessage = (userProfile: UserProfile) => {
    const isSelf = userProfile.id === user?.id;
    const isLastAdmin = adminCount <= 1;
    
    if (isSelf) return "You cannot remove your own admin status";
    if (isLastAdmin) return "Cannot remove the last App Admin";
    return null;
  };

  if (loading || loadingUsers) {
    return (
      <div className="flex-1 min-w-0 bg-card border border-border rounded-lg p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 bg-card border border-border rounded-lg p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">App Administrators</h3>
            <p className="text-sm text-muted-foreground">
              App Admins have full access to all features and settings
            </p>
          </div>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add App Admin
        </Button>
      </div>

      {/* Current Admins Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Avatar</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[80px] text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentAdmins.map((userProfile) => {
              const isSelf = userProfile.id === user?.id;
              const disabled = isRemoveDisabled(userProfile);
              const tooltipMessage = getTooltipMessage(userProfile);

              return (
                <TableRow key={userProfile.id}>
                  <TableCell>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={userProfile.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(userProfile.fullName, userProfile.email)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">
                    {userProfile.fullName || '—'}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {userProfile.email}
                  </TableCell>
                  <TableCell className="text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveClick(userProfile)}
                              disabled={disabled}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              aria-label={`Remove App Admin from ${userProfile.fullName || userProfile.email}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {tooltipMessage && (
                          <TooltipContent>
                            {tooltipMessage}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              );
            })}

            {currentAdmins.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No App Admins found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add App Admin Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add App Admin</DialogTitle>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* User List */}
          <ScrollArea className="h-[300px] border border-border rounded-md">
            {nonAdminUsers.length > 0 ? (
              <div className="divide-y divide-border">
                {nonAdminUsers.map((userProfile) => (
                  <div
                    key={userProfile.id}
                    className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={userProfile.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(userProfile.fullName, userProfile.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">
                          {userProfile.fullName || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {userProfile.email}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddClick(userProfile)}
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {searchQuery ? 'No users match your search' : 'All users are already App Admins'}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog 
        open={confirmDialog.open} 
        onOpenChange={(open) => !saving && setConfirmDialog(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === 'add' ? 'Grant App Admin' : 'Remove App Admin'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'add' ? (
                <>
                  Are you sure you want to grant <strong>{confirmDialog.user?.fullName || confirmDialog.user?.email}</strong> App Admin privileges? 
                  They will have full access to all features and settings.
                </>
              ) : (
                <>
                  Are you sure you want to remove <strong>{confirmDialog.user?.fullName || confirmDialog.user?.email}</strong> as an App Admin? 
                  They will lose access to all admin features.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={saving}
              className={confirmDialog.action === 'remove' 
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" 
                : undefined
              }
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmDialog.action === 'add' ? 'Grant Admin' : 'Remove Admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
