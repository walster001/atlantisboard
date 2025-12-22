/**
 * App Admin User List Component
 * Displays and manages App Admin users
 */

import { useState } from 'react';
import { Plus, Trash2, Shield, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AppAdmin {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface AppAdminUserListProps {
  appAdmins: AppAdmin[];
  loading: boolean;
  onRefresh: () => void;
}

export function AppAdminUserList({ appAdmins, loading, onRefresh }: AppAdminUserListProps) {
  const { user } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppAdmin | null>(null);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchResult, setSearchResult] = useState<AppAdmin | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const isLastAdmin = appAdmins.length <= 1;

  const handleSearch = async () => {
    if (!email.trim()) return;
    
    setSearchError(null);
    setSearchResult(null);
    setSaving(true);

    try {
      // Search for user by email
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, is_admin')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setSearchError('No user found with this email address');
        return;
      }

      // Check if already an admin
      if (data.is_admin) {
        setSearchError('This user is already an App Admin');
        return;
      }

      setSearchResult({ id: data.id, email: data.email, full_name: data.full_name, avatar_url: data.avatar_url });
    } catch (error) {
      console.error('Error searching user:', error);
      setSearchError('Failed to search for user');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!searchResult) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', searchResult.id);

      if (error) throw error;

      toast.success(`${searchResult.full_name || searchResult.email} is now an App Admin`);
      setAddDialogOpen(false);
      setEmail('');
      setSearchResult(null);
      onRefresh();
    } catch (error) {
      console.error('Error adding admin:', error);
      toast.error('Failed to add App Admin');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: false })
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast.success(`${selectedUser.full_name || selectedUser.email} is no longer an App Admin`);
      setRemoveDialogOpen(false);
      setSelectedUser(null);
      onRefresh();
    } catch (error) {
      console.error('Error removing admin:', error);
      toast.error('Failed to remove App Admin');
    } finally {
      setSaving(false);
    }
  };

  const openRemoveDialog = (admin: AppAdmin) => {
    setSelectedUser(admin);
    setRemoveDialogOpen(true);
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex-1 min-w-0 bg-card border border-border rounded-lg p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 bg-card border border-border rounded-lg p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
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

      {/* Admin List */}
      <div className="flex-1 flex flex-col gap-2">
        {appAdmins.map((admin) => {
          const isSelf = admin.id === user?.id;
          const canRemove = !isLastAdmin && !isSelf;
          
          return (
            <div
              key={admin.id}
              className="flex items-center justify-between p-4 bg-background border border-border rounded-md hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={admin.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(admin.full_name, admin.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {admin.full_name || admin.email}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">{admin.email}</span>
                </div>
              </div>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={!canRemove}
                        onClick={() => openRemoveDialog(admin)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canRemove && (
                    <TooltipContent>
                      {isLastAdmin 
                        ? "Cannot remove the last App Admin" 
                        : "You cannot remove yourself"}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })}

        {appAdmins.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No App Admins configured
          </div>
        )}
      </div>

      {/* Add Admin Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add App Admin</DialogTitle>
            <DialogDescription>
              Search for a user by email to grant them App Admin privileges.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter user email..."
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSearchResult(null);
                  setSearchError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={saving || !email.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>

            {searchError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {searchError}
              </div>
            )}

            {searchResult && (
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={searchResult.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(searchResult.full_name, searchResult.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-medium">{searchResult.full_name || searchResult.email}</div>
                  <div className="text-sm text-muted-foreground">{searchResult.email}</div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAdmin} disabled={!searchResult || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add as App Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Admin Confirmation */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove App Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{selectedUser?.full_name || selectedUser?.email}</strong> as an App Admin? 
              They will lose access to all admin features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveAdmin}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}