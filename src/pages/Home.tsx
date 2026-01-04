import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '@/hooks/useAuth';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Plus, MoreHorizontal, Trash2, LogOut, User, Loader2, LayoutDashboard, Settings, Pencil, FileText, Upload } from 'lucide-react';
import { BoardImportDialog } from '@/components/import/BoardImportDialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUserFriendlyError, getErrorMessage, getErrorName } from '@/lib/errorHandler';
import { workspaceSchema, boardSchema, sanitizeColor } from '@/lib/validators';
import { z } from 'zod';
import { subscribeAllWorkspacesViaRegistry, subscribeWorkspaceViaRegistry } from '@/realtime/workspaceSubscriptions';
import { getSubscriptionRegistry } from '@/realtime/subscriptionRegistry';
import { api } from '@/integrations/api/client';
import { useSilentDebouncedFetch } from '@/hooks/useDebouncedFetch';
import { useStableRealtimeHandlers } from '@/hooks/useStableRealtimeHandlers';
import type { WorkspaceResponse as Workspace, BoardResponse as Board, HomeDataResponse } from '@/types/api';

interface BoardTheme {
  id: string;
  name: string;
  navbarColor: string;
  isDefault: boolean;
}

// Helper to darken a hex color by a percentage
function darkenColor(hex: string, percent: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  
  const r = Math.max(0, Math.round(parseInt(result[1], 16) * (1 - percent)));
  const g = Math.max(0, Math.round(parseInt(result[2], 16) * (1 - percent)));
  const b = Math.max(0, Math.round(parseInt(result[3], 16) * (1 - percent)));
  
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Map colors to theme names (kept for reference/backwards compatibility)
const COLOR_THEME_MAP: Record<string, string> = {
  '#0079bf': 'Ocean Blue',
  '#d29034': 'Sunset Orange',
  '#519839': 'Forest Green',
  '#b04632': 'Ruby Red',
  '#89609e': 'Royal Purple',
  '#cd5a91': 'Hot Pink',
  '#4bbf6b': 'Mint Green',
  '#00aecc': 'Teal',
};

export default function Home() {
  const { user, signOut, loading: authLoading, isAppAdmin, isVerified } = useAuth();
  const { settings: appSettings, appName } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardRoles, setBoardRoles] = useState<Record<string, 'admin' | 'manager' | 'viewer'>>({});
  
  // Track dynamic workspace subscriptions
  const workspaceSubscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const [loading, setLoading] = useState(true);
  
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('');
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  
  const [newBoardName, setNewBoardName] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [availableThemes, setAvailableThemes] = useState<BoardTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(false);

  // Edit board state
  const [editBoardId, setEditBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');
  const [renameBoardDialogOpen, setRenameBoardDialogOpen] = useState(false);
  const [editDescDialogOpen, setEditDescDialogOpen] = useState(false);
  const [deleteBoardId, setDeleteBoardId] = useState<string | null>(null);

  // Edit workspace state
  const [editWorkspaceId, setEditWorkspaceId] = useState<string | null>(null);
  const [editWorkspaceName, setEditWorkspaceName] = useState('');
  const [editWorkspaceDesc, setEditWorkspaceDesc] = useState('');
  const [renameWorkspaceDialogOpen, setRenameWorkspaceDialogOpen] = useState(false);
  const [editWorkspaceDescDialogOpen, setEditWorkspaceDescDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(null);
  const [deleteWorkspaceConfirmOpen, setDeleteWorkspaceConfirmOpen] = useState(false);
  const [deletionCounts, setDeletionCounts] = useState<{
    boards?: number;
    columns?: number;
    cards?: number;
    members?: number;
    labels?: number;
    attachments?: number;
  } | null>(null);
  const [deletionCountsLoading, setDeletionCountsLoading] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Detect OAuth callback by checking for hash fragments
  const isOAuthCallback = useCallback(() => {
    const hash = window.location.hash;
    if (!hash) return false;
    
    // Check for OAuth callback indicators in hash
    // PKCE flow uses 'code' parameter, implicit flow uses 'access_token'
    // OAuth callbacks include: access_token, refresh_token, code, error, etc.
    const isCallback = hash.includes('access_token') || 
           hash.includes('refresh_token') || 
           hash.includes('code=') ||  // PKCE flow uses code parameter
           hash.includes('error=') ||
           hash.includes('error_description=');
    
    // Log for debugging
    if (isCallback) {
      console.log('[Home] OAuth callback detected, hash:', hash.substring(0, 100) + '...');
    }
    
    return isCallback;
  }, []);

  // Detect clock skew errors in OAuth callback
  const hasClockSkewError = useCallback(() => {
    const hash = window.location.hash;
    if (!hash) return false;
    
    // Check for clock skew related errors in hash
    const errorDescription = new URLSearchParams(hash.substring(1)).get('error_description');
    return errorDescription?.toLowerCase().includes('clock') || 
           errorDescription?.toLowerCase().includes('skew') ||
           errorDescription?.toLowerCase().includes('future');
  }, []);

  // Clean up OAuth hash fragments from URL after session is established
  useEffect(() => {
    if (user && isOAuthCallback()) {
      // Remove hash fragments from URL without reloading
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [user, isOAuthCallback]);

  // Show clock skew warning if detected
  useEffect(() => {
    if (hasClockSkewError()) {
      toast({
        title: 'Authentication Issue',
        description: 'Clock synchronization issue detected. Please try logging in again. If the problem persists, check your system clock.',
        variant: 'destructive',
      });
    }
  }, [hasClockSkewError, toast]);

  useEffect(() => {
    // Don't redirect if we're processing an OAuth callback
    // Wait for the auth system to process the hash fragments and establish the session
    if (isOAuthCallback()) {
      console.log('[Home] OAuth callback detected, waiting for session establishment...');
      // Give the auth system time to process the OAuth callback
      // The auth state change handler will update the user state
      // Wait longer if clock skew error is detected (retry logic is working)
      const waitTime = hasClockSkewError() ? 5000 : 2000; // Increased wait time to 2s default, 5s for clock skew
      if (waitTime > 0) {
        setTimeout(() => {
          // Check again after waiting
          if (!authLoading && !user) {
            console.log('[Home] OAuth callback processed but no user found, redirecting to /auth');
            navigate('/auth');
          } else if (user) {
            console.log('[Home] OAuth callback successful, user authenticated');
          }
        }, waitTime);
      }
      // Always return early if OAuth callback is detected - don't redirect while processing
      return;
    }
    
    // Only redirect if we're certain the user is not authenticated
    // and we're not in the middle of an OAuth callback
    // Also ensure we're not still loading (which could indicate OAuth processing)
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate, isOAuthCallback, hasClockSkewError]);

  useEffect(() => {
    if (user) {
      fetchData();
      // Check for and redeem any pending invite token only if user is verified
      // This prevents token redemption for unverified users in google_verified mode
      if (isVerified) {
        redeemPendingInviteToken();
      }
    }
  }, [user, isVerified]);

  // Handle navigation state when user is redirected after being removed from a board
  useEffect(() => {
    const state = location.state as { removedFromBoard?: { boardId: string; workspaceId: string | null; timestamp: number } } | null;
    
    if (state?.removedFromBoard && user) {
      const { boardId, workspaceId } = state.removedFromBoard;
      
      // Remove the board from state
      setBoards(prev => {
        const updatedBoards = prev.filter(b => b.id !== boardId);
        
        // Check if we need to remove the workspace too
        if (workspaceId) {
          const remainingBoardsInWorkspace = updatedBoards.filter(
            b => b.workspaceId === workspaceId
          );
          
          if (remainingBoardsInWorkspace.length === 0) {
            setWorkspaces(prevWorkspaces => 
              prevWorkspaces.filter(w => w.id !== workspaceId)
            );
          }
        }
        
        return updatedBoards;
      });
      
      // Remove from board roles
      setBoardRoles(prev => {
        const updated = { ...prev };
        delete updated[boardId];
        return updated;
      });
      
      // Show notification
      toast({
        title: 'Access removed',
        description: 'You have been removed from this board.',
        variant: 'destructive',
      });
      
      // Clear the navigation state to prevent re-triggering
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, user, navigate]);

  // Define fetchData using useCallback so it can be used in useEffect dependencies
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Single server-side call to get all home data
      const { data, error } = await api.rpc('getHomeData', {
        _user_id: user.id
      });

      if (error) throw error;

      // Cast JSON response to typed object
      const result = data as HomeDataResponse;

      setWorkspaces(result?.workspaces || []);
      setBoards(result?.boards || []);
      setBoardRoles(result?.boardRoles || {});
    } catch (error: unknown) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Silent fetch for realtime updates (no loading spinner to prevent UI flicker)
  const silentFetchData = useCallback(async () => {
    if (!user) return;
    try {
      // Single server-side call to get all home data
      const { data, error } = await api.rpc('getHomeData', {
        _user_id: user.id
      });

      if (error) throw error;

      // Cast JSON response to typed object
      const result = data as HomeDataResponse;

      setWorkspaces(result?.workspaces || []);
      setBoards(result?.boards || []);
      setBoardRoles(result?.boardRoles || {});
    } catch (error: unknown) {
      console.error('Error fetching data:', error);
    }
  }, [user]);

  // Debounced silent fetch for realtime updates
  const debouncedFetchData = useSilentDebouncedFetch(silentFetchData);

  // Create stable nested handlers for dynamically added workspaces
  // These are used when a user is added to a new workspace
  const nestedStableHandlers = useStableRealtimeHandlers({
    onBoardUpdate: (board, event) => {
      if (event.eventType === 'INSERT' || event.eventType === 'UPDATE' || event.eventType === 'DELETE') {
        debouncedFetchData();
      }
    },
    onMemberUpdate: (member, event) => {
      const membership = member as { boardId?: string; userId?: string };
      if (membership.userId !== user?.id) return;
      
      if (event.eventType === 'INSERT') {
        debouncedFetchData();
        toast({
          title: 'Board access granted',
          description: 'You have been added to a new board.',
        });
      } else if (event.eventType === 'DELETE') {
        debouncedFetchData();
        toast({
          title: 'Board access removed',
          description: 'You have been removed from a board.',
        });
      }
    },
  }, [debouncedFetchData, user, toast]);

  // Create stable handlers with batching and stable references
  const stableHandlers = useStableRealtimeHandlers({
    onBoardUpdate: (board, event) => {
      if (event.eventType === 'INSERT') {
        // New board - use silent refetch to get board roles and ensure consistency
        debouncedFetchData();
      } else if (event.eventType === 'UPDATE') {
        const boardData = event.new as unknown as Board | null;
        const oldBoard = event.old as unknown as Board | null;
        
        if (!boardData) {
          // No new data - use refetch
          debouncedFetchData();
          return;
        }
        
        // Check if this is a simple property update (name, description, backgroundColor)
        const oldWorkspaceId = oldBoard?.workspaceId;
        const newWorkspaceId = boardData.workspaceId;
        const isWorkspaceMove = oldWorkspaceId && newWorkspaceId && oldWorkspaceId !== newWorkspaceId;
        
        // Check if only simple properties changed
        const simplePropsChanged = 
          (oldBoard?.name !== boardData.name) ||
          (oldBoard?.description !== boardData.description) ||
          (oldBoard?.backgroundColor !== boardData.backgroundColor) ||
          (oldBoard?.position !== boardData.position);
        
        if (isWorkspaceMove || !simplePropsChanged) {
          // Complex change (workspace move, or unknown change) - use refetch
          debouncedFetchData();
        } else {
          // Simple property update - use incremental state update
          setBoards((prev) =>
            prev.map((b) => (b.id === boardData.id ? { ...b, ...boardData } : b))
          );
        }
      } else if (event.eventType === 'DELETE') {
        debouncedFetchData();
      }
    },
    onMemberUpdate: (member, event) => {
      const membership = member as { boardId?: string; userId?: string };
      // Only process if it's the current user
      if (membership.userId !== user.id) return;
      
      if (event.eventType === 'INSERT') {
        debouncedFetchData();
        toast({
          title: 'Board access granted',
          description: 'You have been added to a new board.',
        });
      } else if (event.eventType === 'DELETE') {
        debouncedFetchData();
        toast({
          title: 'Board access removed',
          description: 'You have been removed from a board.',
        });
      }
    },
    onWorkspaceUpdate: (workspace, event) => {
      // Check table to distinguish between workspace entity and membership updates
        if (event.table === 'workspaces') {
          // Handle workspace entity updates (name, description, etc.)
          const workspaceEntity = event.new as unknown as Workspace | null;
          const oldWorkspace = event.old as unknown as Workspace | null;
        
        if (event.eventType === 'UPDATE' && workspaceEntity) {
          // Simple property update - use incremental state update
          setWorkspaces((prev) =>
            prev.map((w) => (w.id === workspaceEntity.id ? { ...w, ...workspaceEntity } : w))
          );
        } else if (event.eventType === 'DELETE') {
          // Workspace deleted - use refetch to ensure all related data is cleaned up
          debouncedFetchData();
        }
      } else if (event.table === 'workspaceMembers') {
        // Handle workspace membership updates
        const workspaceData = workspace as { workspaceId?: string; userId?: string };
        // Only process if it's the current user
        if (workspaceData.userId !== user.id) return;
        
        if (event.eventType === 'INSERT') {
          // User added to a workspace - dynamically subscribe to new workspace
          const newWorkspaceId = workspaceData.workspaceId;
          if (newWorkspaceId) {
            const registry = getSubscriptionRegistry();
            if (!registry.isSubscribed(newWorkspaceId)) {
              // Subscribe to new workspace via registry with stable handlers
              const nestedCleanup = subscribeWorkspaceViaRegistry(newWorkspaceId, nestedStableHandlers);
              nestedSubscriptionCleanupRef.current.set(newWorkspaceId, nestedCleanup);
            }
          }
          
          // User added to a workspace - refresh data
          debouncedFetchData();
          toast({
            title: 'Workspace access granted',
            description: 'You have been added to a new workspace.',
          });
        } else if (event.eventType === 'DELETE') {
          const deletedMembership = event.old as { workspaceId: string; userId: string };
          const deletedWorkspaceId = deletedMembership.workspaceId;

          // Unsubscribe from workspace
          const registry = getSubscriptionRegistry();
          registry.unsubscribeWorkspace(deletedWorkspaceId);

          // Use refetch to ensure all related data is cleaned up
          debouncedFetchData();

          toast({
            title: 'Workspace access removed',
            description: 'You have been removed from a workspace.',
          });
        }
      }
    },
  }, [debouncedFetchData, user, toast]);

  // Track previous workspaceIds to detect changes
  const prevWorkspaceIdsRef = useRef<string[]>([]);
  const nestedSubscriptionCleanupRef = useRef<Map<string, () => void>>(new Map());

  // Unified workspace subscription using parent-child hierarchy
  // Subscribes to all workspaces user has access to, receives all child updates
  // Subscriptions persist via registry - cleanup on dependency changes
  useEffect(() => {
    if (!user || workspaces.length === 0) return;

    const workspaceIds = workspaces.map((w) => w.id);
    const prevWorkspaceIds = prevWorkspaceIdsRef.current;
    
    // Unsubscribe from removed workspaces
    const removedWorkspaceIds = prevWorkspaceIds.filter(id => !workspaceIds.includes(id));
    removedWorkspaceIds.forEach(id => {
      const registry = getSubscriptionRegistry();
      registry.unsubscribeWorkspace(id);
      // Clean up nested subscription cleanup if exists
      const nestedCleanup = nestedSubscriptionCleanupRef.current.get(id);
      if (nestedCleanup) {
        nestedCleanup();
        nestedSubscriptionCleanupRef.current.delete(id);
      }
    });
    
    // Subscribe to new workspaces
    const cleanup = subscribeAllWorkspacesViaRegistry(workspaceIds, stableHandlers);
    
    prevWorkspaceIdsRef.current = workspaceIds;
    
    return () => {
      cleanup(); // Clean up handlers when dependencies change
      // Cleanup function from stableHandlers will process pending batches
      if (stableHandlers.__cleanup) {
        stableHandlers.__cleanup();
      }
      // Clean up all nested subscriptions
      nestedSubscriptionCleanupRef.current.forEach(nestedCleanup => nestedCleanup());
      nestedSubscriptionCleanupRef.current.clear();
    };
  }, [user, workspaces, stableHandlers]);

  // Redeem pending invite token from sessionStorage (set when user clicks invite link)
  const redeemPendingInviteToken = async () => {
    const pendingToken = sessionStorage.getItem('pendingInviteToken');
    if (!pendingToken || !user) return;

    try {
      const result = await api.functions.invoke('redeem-invite-token', {
        body: { token: pendingToken },
      });
      
      const { data, error } = result;

      // Clear the token regardless of outcome
      sessionStorage.removeItem('pendingInviteToken');

      if (error) {
        console.error('Error redeeming invite token:', error);
        toast({
          title: 'Invite Error',
          description: 'Failed to process your invitation. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      // Type the response data
      const responseData = data as {
        success: boolean;
        message?: string;
        alreadyMember?: boolean;
        boardId?: string;
      } | null;

      if (!responseData || !responseData.success) {
        toast({
          title: 'Invite Error',
          description: responseData?.message || 'This invite link is no longer valid.',
          variant: 'destructive',
        });
        return;
      }

      if (responseData.alreadyMember) {
        toast({
          title: 'Already a member',
          description: 'You are already a member of this board.',
        });
      } else {
        toast({
          title: 'Welcome!',
          description: 'You have been added to the board as a viewer.',
        });
      }

      // Refresh data to show the new board
      fetchData();

      // Navigate to the board
      if (responseData.boardId) {
        navigate(`/board/${responseData.boardId}`);
      }
    } catch (error) {
      console.error('Error redeeming invite:', error);
      sessionStorage.removeItem('pendingInviteToken');
    }
  };


  // Fetch themes when board dialog opens
  const fetchThemes = async () => {
    setThemesLoading(true);
    try {
      const { data, error } = await api
        .from('board_themes')
        .select('*') as { data: BoardTheme[] | null; error: Error | null };

      if (error) {
        console.error('[fetchThemes] API error:', error);
        throw error;
      }


      // Sort themes: default themes in THEME_ORDER first, then custom themes alphabetically
      const THEME_ORDER = [
        'Ocean Blue', 'Sunset Orange', 'Forest Green', 'Ruby Red',
        'Royal Purple', 'Hot Pink', 'Mint Green', 'Teal',
      ];
      
      // Prisma returns data in camelCase format matching the BoardTheme interface
      const allThemes = (data || []) as BoardTheme[];
      
      const sortedThemes = allThemes.sort((a, b) => {
        if (a.isDefault && b.isDefault) {
          const aIndex = THEME_ORDER.indexOf(a.name);
          const bIndex = THEME_ORDER.indexOf(b.name);
          return aIndex - bIndex;
        }
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
      
      setAvailableThemes(sortedThemes);
      
      // Always set default theme (Ocean Blue) when dialog opens
      if (sortedThemes.length > 0) {
        const oceanBlue = sortedThemes.find(t => t.name === 'Ocean Blue' && t.isDefault);
        setSelectedThemeId(oceanBlue?.id || sortedThemes[0].id);
      }
    } catch (error: unknown) {
      console.error('Fetch themes error:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Error loading themes',
        description: errorMessage || 'Failed to load board themes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setThemesLoading(false);
    }
  };

  const createWorkspace = async () => {
    if (!user) return;

    try {
      // Validate input
      const validated = workspaceSchema.parse({
        name: newWorkspaceName,
        description: newWorkspaceDesc || null,
      });

      const { data: workspace, error } = await api
        .from('workspaces')
        .insert({
          name: validated.name,
          description: validated.description,
          ownerId: user.id,
        });

      if (error) throw error;
      if (!workspace) throw new Error('Failed to create workspace');

      // Add owner as workspace member
      await api.from('workspaceMembers').insert({
        workspaceId: workspace.id,
        userId: user.id,
      });

      setWorkspaceDialogOpen(false);
      setNewWorkspaceName('');
      setNewWorkspaceDesc('');
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Workspace created!' });
    } catch (error: unknown) {
      console.error('Create workspace error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const fetchWorkspaceDeletionCounts = async (workspaceId: string) => {
    setDeletionCountsLoading(true);
    try {
      const { data, error } = await api.rpc('get_workspace_deletion_counts', {
        _workspace_id: workspaceId
      });
      if (error) throw error;
      setDeletionCounts(data as any);
    } catch (error) {
      console.error('Error fetching deletion counts:', error);
      setDeletionCounts(null);
    } finally {
      setDeletionCountsLoading(false);
    }
  };

  const fetchBoardDeletionCounts = async (boardId: string) => {
    setDeletionCountsLoading(true);
    try {
      const { data, error } = await api.rpc('get_board_deletion_counts', {
        _board_id: boardId
      });
      if (error) throw error;
      setDeletionCounts(data as any);
    } catch (error) {
      console.error('Error fetching deletion counts:', error);
      setDeletionCounts(null);
    } finally {
      setDeletionCountsLoading(false);
    }
  };

  const deleteWorkspace = async (id: string) => {
    try {
      // Use the service endpoint which properly handles workspace deletion with permissions
      const { error } = await (api as any).request(`/workspaces/${id}`, {
        method: 'DELETE',
      });
      if (error) throw error;
      setDeleteWorkspaceConfirmOpen(false);
      setDeleteWorkspaceId(null);
      setDeletionCounts(null);
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Workspace deleted' });
    } catch (error: unknown) {
      console.error('Delete workspace error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const renameWorkspace = async () => {
    if (!editWorkspaceId) return;

    try {
      const validated = workspaceSchema.parse({
        name: editWorkspaceName,
        description: null,
      });

      const { error } = await api
        .from('workspaces')
        .eq('id', editWorkspaceId)
        .update({ name: validated.name });
      if (error) throw error;
      setRenameWorkspaceDialogOpen(false);
      setEditWorkspaceId(null);
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Workspace renamed' });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        console.error('Rename workspace error:', error);
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const updateWorkspaceDescription = async () => {
    if (!editWorkspaceId) return;

    try {
      const validated = workspaceSchema.parse({
        name: 'placeholder',
        description: editWorkspaceDesc || null,
      });

      const { error } = await api
        .from('workspaces')
        .eq('id', editWorkspaceId)
        .update({ description: validated.description });
      if (error) throw error;
      setEditWorkspaceDescDialogOpen(false);
      setEditWorkspaceId(null);
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Description updated' });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        console.error('Update workspace description error:', error);
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const createBoard = async () => {
    if (!selectedWorkspaceId || !user || !selectedThemeId) return;

    try {
      // Validate input
      const selectedTheme = availableThemes.find(t => t.id === selectedThemeId);
      if (!selectedTheme) {
        toast({ title: 'Error', description: 'Please select a theme', variant: 'destructive' });
        return;
      }

      const validated = boardSchema.parse({
        name: newBoardName,
        backgroundColor: selectedTheme.navbarColor,
      });

      // Set background color to slightly darker than navbar
      const backgroundColor = darkenColor(selectedTheme.navbarColor, 0.1);

      // Use the service endpoint which automatically adds creator as admin
      // Using api.request directly like other components (InviteLinkButton, etc.)
      const { data: board, error } = await (api as any).request('/boards', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name: validated.name,
          backgroundColor: backgroundColor,
          themeId: selectedThemeId,
        }),
      });

      if (error) {
        console.error('Board creation error details:', error);
        throw error;
      }
      if (!board) throw new Error('Failed to create board');

      setBoardDialogOpen(false);
      setNewBoardName('');
      // Reset to Ocean Blue for next board
      const oceanBlue = availableThemes.find(t => t.name === 'Ocean Blue' && t.isDefault);
      setSelectedThemeId(oceanBlue?.id || availableThemes[0]?.id || null);
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Board created!' });
    } catch (error: unknown) {
      console.error('Create board error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      const { error } = await api.from('boards').eq('id', id).delete();
      if (error) throw error;
      setDeleteConfirmOpen(false);
      setDeleteBoardId(null);
      setDeletionCounts(null);
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Board deleted' });
    } catch (error: unknown) {
      console.error('Delete board error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const renameBoard = async () => {
    if (!editBoardId) return;
    try {
      const validated = boardSchema.parse({ name: editBoardName, backgroundColor: '#0079bf' });
      const { error } = await api
        .from('boards')
        .eq('id', editBoardId)
        .update({ name: validated.name });
      if (error) throw error;
      setRenameBoardDialogOpen(false);
      setEditBoardId(null);
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Board renamed' });
    } catch (error: unknown) {
      console.error('Rename board error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const updateBoardDescription = async () => {
    if (!editBoardId) return;
    try {
      const { error } = await api
        .from('boards')
        .eq('id', editBoardId)
        .update({ description: editBoardDesc || null });
      if (error) throw error;
      setEditDescDialogOpen(false);
      setEditBoardId(null);
      // Refresh data from server to ensure consistency
      await fetchData();
      toast({ title: 'Description updated' });
    } catch (error: unknown) {
      console.error('Update description error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Handle board drag and drop
  const onDragEnd = useCallback(async (result: DropResult) => {
    if (!user) return;
    
    const { destination, source, draggableId } = result;
    
    // Dropped outside a droppable area
    if (!destination) return;
    
    // Dropped in same position
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceWorkspaceId = source.droppableId;
    const destWorkspaceId = destination.droppableId;
    const boardId = draggableId;

    // Check if user can edit this board
    if (boardRoles[boardId] !== 'admin' && !isAppAdmin) {
      toast({ title: 'Permission denied', description: 'You must be a board admin to move this board.', variant: 'destructive' });
      return;
    }

    // Get boards in source and destination workspaces
    const sourceBoards = boards
      .filter(b => b.workspaceId === sourceWorkspaceId)
      .sort((a, b) => a.position - b.position);
    const destBoards = sourceWorkspaceId === destWorkspaceId
      ? sourceBoards
      : boards.filter(b => b.workspaceId === destWorkspaceId).sort((a, b) => a.position - b.position);

    const draggedBoard = boards.find(b => b.id === boardId);
    if (!draggedBoard) return;

    // Optimistically update local state
    if (sourceWorkspaceId === destWorkspaceId) {
      // Same workspace reordering
      const newBoards = Array.from(sourceBoards);
      const [removed] = newBoards.splice(source.index, 1);
      newBoards.splice(destination.index, 0, removed);
      
      const updatedBoards = newBoards.map((b, idx) => ({ ...b, position: idx }));
      
      setBoards(prev => {
        const others = prev.filter(b => b.workspaceId !== sourceWorkspaceId);
        return [...others, ...updatedBoards];
      });

      // Update database
      await api.rpc('batch_update_board_positions', {
        _user_id: user.id,
        _workspace_id: sourceWorkspaceId,
        _updates: updatedBoards.map(b => ({ id: b.id, position: b.position }))
      });
    } else {
      // Moving between workspaces
      const newSourceBoards = sourceBoards.filter(b => b.id !== boardId);
      const newDestBoards = [...destBoards];
      const updatedBoard = { ...draggedBoard, workspaceId: destWorkspaceId, position: destination.index };
      newDestBoards.splice(destination.index, 0, updatedBoard);

      // Update positions
      const updatedSourceBoards = newSourceBoards.map((b, idx) => ({ ...b, position: idx }));
      const updatedDestBoards = newDestBoards.map((b, idx) => ({ ...b, position: idx }));

      setBoards(prev => {
        const others = prev.filter(b => b.workspaceId !== sourceWorkspaceId && b.workspaceId !== destWorkspaceId);
        return [...others, ...updatedSourceBoards, ...updatedDestBoards];
      });

      // Update database
      const { data, error } = await api.rpc('move_board_to_workspace', {
        _user_id: user.id,
        _board_id: boardId,
        _new_workspace_id: destWorkspaceId,
        _new_position: destination.index
      });

      if (error || (data as any)?.error) {
        toast({ title: 'Error moving board', description: (data as any)?.error || getUserFriendlyError(error), variant: 'destructive' });
        // Revert by refetching
        fetchData();
      } else {
        toast({ title: 'Board moved successfully' });
      }
    }
  }, [boards, boardRoles, user, isAppAdmin, toast, fetchData]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kanban-bg">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {appSettings?.customHomeLogoEnabled && appSettings?.customHomeLogoUrl ? (
              <img
                src={appSettings.customHomeLogoUrl}
                alt="Logo"
                style={{ width: appSettings.customHomeLogoSize, height: appSettings.customHomeLogoSize }}
                className="object-contain"
              />
            ) : (
              <LayoutDashboard className="h-6 w-6 text-primary" />
            )}
            <h1 className="text-xl font-bold">{appName}</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.userMetadata?.avatarUrl} />
                  <AvatarFallback>
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{user?.userMetadata?.fullName || user?.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAppAdmin && (
                <DropdownMenuItem onClick={() => navigate('/admin/config')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Admin Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Workspaces Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Your Workspaces</h2>
            {isAppAdmin && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      New Workspace
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Workspace</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={newWorkspaceName}
                          onChange={(e) => setNewWorkspaceName(e.target.value)}
                          placeholder="My Workspace"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Input
                          value={newWorkspaceDesc}
                          onChange={(e) => setNewWorkspaceDesc(e.target.value)}
                          placeholder="Team projects and tasks"
                          maxLength={500}
                        />
                      </div>
                      <Button onClick={createWorkspace} className="w-full">
                        Create Workspace
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          {workspaces.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>{isAppAdmin ? 'No workspaces yet. Create one to get started!' : 'No workspaces available. Contact an admin to get access.'}</p>
              </CardContent>
            </Card>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="space-y-6">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium">{workspace.name}</h3>
                        {workspace.description && (
                          <p className="text-sm text-muted-foreground">{workspace.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(workspace.ownerId === user?.id || isAppAdmin) && (
                          <Dialog
                            open={boardDialogOpen && selectedWorkspaceId === workspace.id}
                            onOpenChange={(open) => {
                              setBoardDialogOpen(open);
                              if (open) {
                                setSelectedWorkspaceId(workspace.id);
                                setSelectedThemeId(null); // Reset theme selection
                                setNewBoardName(''); // Reset board name
                                fetchThemes();
                              } else {
                                setSelectedWorkspaceId(null);
                                setSelectedThemeId(null);
                                setNewBoardName('');
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Plus className="h-4 w-4 mr-1" />
                                Add Board
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Create Board</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <div className="space-y-2">
                                  <Label>Board Name</Label>
                                  <Input
                                    value={newBoardName}
                                    onChange={(e) => setNewBoardName(e.target.value)}
                                    placeholder="Project Board"
                                    maxLength={100}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Theme</Label>
                                  {themesLoading ? (
                                    <div className="flex items-center justify-center py-4">
                                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                  ) : availableThemes.length === 0 ? (
                                    <div className="text-center py-4 text-sm text-muted-foreground">
                                      No themes available
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto">
                                      {availableThemes.map((theme) => (
                                        <button
                                          key={theme.id}
                                          className={`flex items-center gap-2 p-2 rounded-md transition-all border ${
                                            selectedThemeId === theme.id 
                                              ? 'ring-2 ring-primary ring-offset-2 border-primary' 
                                              : 'border-border hover:border-primary/50'
                                          }`}
                                          onClick={() => setSelectedThemeId(theme.id)}
                                        >
                                          <div 
                                            className="w-6 h-6 rounded shrink-0"
                                            style={{ backgroundColor: theme.navbarColor }}
                                          />
                                          <span className="text-sm font-medium truncate">
                                            {theme.name}
                                          </span>
                                          {!theme.isDefault && (
                                            <span className="text-xs text-muted-foreground ml-auto">Custom</span>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <Button onClick={createBoard} className="w-full" disabled={!selectedThemeId || !newBoardName.trim()}>
                                  Create Board
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                        {(workspace.ownerId === user?.id || isAppAdmin) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditWorkspaceId(workspace.id);
                                  setEditWorkspaceName(workspace.name);
                                  setRenameWorkspaceDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Rename Workspace
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditWorkspaceId(workspace.id);
                                  setEditWorkspaceDesc(workspace.description || '');
                                  setEditWorkspaceDescDialogOpen(true);
                                }}
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                Edit Description
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setDeleteWorkspaceId(workspace.id);
                                  setDeleteWorkspaceConfirmOpen(true);
                                  fetchWorkspaceDeletionCounts(workspace.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Workspace
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {/* Boards Grid - Droppable */}
                    <Droppable droppableId={workspace.id} direction="horizontal">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 min-h-[120px] rounded-lg transition-colors ${
                            snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-dashed' : ''
                          }`}
                        >
                          {boards
                            .filter((b) => b.workspaceId === workspace.id)
                            .sort((a, b) => a.position - b.position)
                            .map((board, index) => {
                              const canDrag = boardRoles[board.id] === 'admin' || isAppAdmin;
                              return (
                                <Draggable 
                                  key={board.id} 
                                  draggableId={board.id} 
                                  index={index}
                                  isDragDisabled={!canDrag}
                                >
                                  {(provided, snapshot) => (
                                    <Card
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`group hover:shadow-lg transition-all overflow-hidden ${
                                        snapshot.isDragging ? 'shadow-xl rotate-2 scale-105' : ''
                                      } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                                      onClick={() => !snapshot.isDragging && navigate(`/board/${board.id}`)}
                                    >
                                      <div
                                        className="h-24 flex items-end p-3"
                                        style={{ backgroundColor: sanitizeColor(board.backgroundColor) }}
                                      >
                                        <CardTitle className="text-white text-lg drop-shadow-md">
                                          {board.name}
                                        </CardTitle>
                                      </div>
                                      <CardContent className="p-3 flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">
                                          {board.description || 'No description'}
                                        </span>
                                        {canDrag && (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger
                                              asChild
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                <MoreHorizontal className="h-4 w-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              <DropdownMenuItem
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditBoardId(board.id);
                                                  setEditBoardName(board.name);
                                                  setRenameBoardDialogOpen(true);
                                                }}
                                              >
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Rename Board
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditBoardId(board.id);
                                                  setEditBoardDesc(board.description || '');
                                                  setEditDescDialogOpen(true);
                                                }}
                                              >
                                                <FileText className="h-4 w-4 mr-2" />
                                                Edit Description
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDeleteBoardId(board.id);
                                                  setDeleteConfirmOpen(true);
                                                  fetchBoardDeletionCounts(board.id);
                                                }}
                                              >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete Board
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )}
                                      </CardContent>
                                    </Card>
                                  )}
                                </Draggable>
                              );
                            })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>
          )}
        </div>
      </main>

      {/* Rename Board Dialog */}
      <Dialog open={renameBoardDialogOpen} onOpenChange={setRenameBoardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Board Name</Label>
              <Input
                value={editBoardName}
                onChange={(e) => setEditBoardName(e.target.value)}
                placeholder="Board name"
                maxLength={100}
              />
            </div>
            <Button onClick={renameBoard} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Description Dialog */}
      <Dialog open={editDescDialogOpen} onOpenChange={setEditDescDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editBoardDesc}
                onChange={(e) => setEditBoardDesc(e.target.value)}
                placeholder="Board description (optional)"
                maxLength={500}
                rows={4}
              />
            </div>
            <Button onClick={updateBoardDescription} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Workspace Dialog */}
      <Dialog open={renameWorkspaceDialogOpen} onOpenChange={setRenameWorkspaceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Workspace Name</Label>
              <Input
                value={editWorkspaceName}
                onChange={(e) => setEditWorkspaceName(e.target.value)}
                placeholder="Workspace name"
                maxLength={100}
              />
            </div>
            <Button onClick={renameWorkspace} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Workspace Description Dialog */}
      <Dialog open={editWorkspaceDescDialogOpen} onOpenChange={setEditWorkspaceDescDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace Description</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editWorkspaceDesc}
                onChange={(e) => setEditWorkspaceDesc(e.target.value)}
                placeholder="Workspace description (optional)"
                maxLength={500}
                rows={4}
              />
            </div>
            <Button onClick={updateWorkspaceDescription} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => {
        setDeleteConfirmOpen(open);
        if (!open) {
          setDeleteBoardId(null);
          setDeletionCounts(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Board</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Are you sure you want to delete this board? This action cannot be undone.</p>
                {deletionCountsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Calculating impact...</span>
                  </div>
                ) : deletionCounts && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-1">
                    <p className="font-medium text-destructive">The following will be permanently deleted:</p>
                    <ul className="text-sm space-y-0.5 text-muted-foreground">
                      {Number(deletionCounts.columns) > 0 && <li>• {deletionCounts.columns} column{Number(deletionCounts.columns) !== 1 ? 's' : ''}</li>}
                      {Number(deletionCounts.cards) > 0 && <li>• {deletionCounts.cards} card{Number(deletionCounts.cards) !== 1 ? 's' : ''}</li>}
                      {Number(deletionCounts.labels) > 0 && <li>• {deletionCounts.labels} label{Number(deletionCounts.labels) !== 1 ? 's' : ''}</li>}
                      {Number(deletionCounts.attachments) > 0 && <li>• {deletionCounts.attachments} attachment{Number(deletionCounts.attachments) !== 1 ? 's' : ''}</li>}
                      {Number(deletionCounts.members) > 0 && <li>• {deletionCounts.members} member assignment{Number(deletionCounts.members) !== 1 ? 's' : ''}</li>}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteBoardId) {
                  deleteBoard(deleteBoardId);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Workspace Confirmation Dialog */}
      <AlertDialog open={deleteWorkspaceConfirmOpen} onOpenChange={(open) => {
        setDeleteWorkspaceConfirmOpen(open);
        if (!open) {
          setDeleteWorkspaceId(null);
          setDeletionCounts(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Are you sure you want to delete this workspace? This action cannot be undone.</p>
                {deletionCountsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Calculating impact...</span>
                  </div>
                ) : deletionCounts && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-1">
                    <p className="font-medium text-destructive">The following will be permanently deleted:</p>
                    <ul className="text-sm space-y-0.5 text-muted-foreground">
                      {Number(deletionCounts.boards) > 0 && <li>• {deletionCounts.boards} board{Number(deletionCounts.boards) !== 1 ? 's' : ''}</li>}
                      {Number(deletionCounts.columns) > 0 && <li>• {deletionCounts.columns} column{Number(deletionCounts.columns) !== 1 ? 's' : ''}</li>}
                      {Number(deletionCounts.cards) > 0 && <li>• {deletionCounts.cards} card{Number(deletionCounts.cards) !== 1 ? 's' : ''}</li>}
                      {Number(deletionCounts.members) > 0 && <li>• {deletionCounts.members} workspace member{Number(deletionCounts.members) !== 1 ? 's' : ''}</li>}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteWorkspaceId) {
                  deleteWorkspace(deleteWorkspaceId);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Board Import Dialog */}
      <BoardImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={fetchData}
      />

    </div>
  );
}
