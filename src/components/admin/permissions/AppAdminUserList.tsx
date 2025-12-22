/**
 * App Admin User List Component
 * Displays all users with toggle to assign/remove App Admin status
 */

import { useState, useEffect } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

interface AppAdminUserListProps {
  loading: boolean;
  onRefresh: () => void;
}

export function AppAdminUserList({ loading, onRefresh }: AppAdminUserListProps) {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    user: UserProfile | null;
    action: 'add' | 'remove';
  }>({ open: false, user: null, action: 'add' });
  const [saving, setSaving] = useState(false);

  const adminCount = allUsers.filter(u => u.is_admin).length;

  useEffect(() => {
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, is_admin')
        .order('full_name', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleClick = (userProfile: UserProfile) => {
    const action = userProfile.is_admin ? 'remove' : 'add';
    setConfirmDialog({ open: true, user: userProfile, action });
  };

  const handleConfirm = async () => {
    const { user: targetUser, action } = confirmDialog;
    if (!targetUser) return;

    setSaving(true);
    try {
      const newAdminStatus = action === 'add';
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: newAdminStatus })
        .eq('id', targetUser.id);

      if (error) throw error;

      const displayName = targetUser.full_name || targetUser.email;
      if (action === 'add') {
        toast.success(`${displayName} is now an App Admin`);
      } else {
        toast.success(`${displayName} is no longer an App Admin`);
      }

      setConfirmDialog({ open: false, user: null, action: 'add' });
      onRefresh();
      fetchAllUsers();
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

  const isToggleDisabled = (userProfile: UserProfile) => {
    const isSelf = userProfile.id === user?.id;
    const isLastAdmin = userProfile.is_admin && adminCount <= 1;
    return isSelf || isLastAdmin;
  };

  const getTooltipMessage = (userProfile: UserProfile) => {
    const isSelf = userProfile.id === user?.id;
    const isLastAdmin = userProfile.is_admin && adminCount <= 1;
    
    if (isSelf) return "You cannot modify your own admin status";
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
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
        <Shield className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">App Administrators</h3>
          <p className="text-sm text-muted-foreground">
            App Admins have full access to all features and settings
          </p>
        </div>
      </div>

      {/* User Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Avatar</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[100px] text-right">App Admin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allUsers.map((userProfile) => {
              const isSelf = userProfile.id === user?.id;
              const disabled = isToggleDisabled(userProfile);
              const tooltipMessage = getTooltipMessage(userProfile);

              return (
                <TableRow key={userProfile.id}>
                  <TableCell>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={userProfile.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(userProfile.full_name, userProfile.email)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">
                    {userProfile.full_name || '—'}
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
                            <Switch
                              checked={userProfile.is_admin}
                              onCheckedChange={() => handleToggleClick(userProfile)}
                              disabled={disabled}
                              aria-label={`Toggle App Admin for ${userProfile.full_name || userProfile.email}`}
                            />
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

            {allUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
                  Are you sure you want to grant <strong>{confirmDialog.user?.full_name || confirmDialog.user?.email}</strong> App Admin privileges? 
                  They will have full access to all features and settings.
                </>
              ) : (
                <>
                  Are you sure you want to remove <strong>{confirmDialog.user?.full_name || confirmDialog.user?.email}</strong> as an App Admin? 
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
