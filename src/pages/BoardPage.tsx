import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { MobileColumnCarousel } from '@/components/kanban/MobileColumnCarousel';
import { CardDetailModal } from '@/components/kanban/CardDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, ArrowLeft, Loader2, LayoutGrid, LogOut, User, Settings, MoreVertical } from 'lucide-react';
import { InviteLinkButton } from '@/components/kanban/InviteLinkButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card as CardType, Label } from '@/types/kanban';
import { BoardMembersDialog } from '@/components/kanban/BoardMembersDialog';
import { BoardSettingsModal } from '@/components/kanban/BoardSettingsModal';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { columnSchema, cardSchema, sanitizeColor } from '@/lib/validators';
import { useDragScroll } from '@/hooks/useDragScroll';
import { z } from 'zod';
import { BoardTheme } from '@/components/kanban/ThemeEditorModal';
import { cn } from '@/lib/utils';
interface DbColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  color: string | null;
}

interface DbCard {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  created_by: string | null;
  color: string | null;
}

interface DbLabel {
  id: string;
  board_id: string;
  name: string;
  color: string;
}

interface DbCardLabel {
  card_id: string;
  label_id: string;
}


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

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAppAdmin, signOut } = useAuth();
  const { settings: appSettings } = useAppSettings();
  const { isMobile, isTablet, isDesktop } = useResponsiveLayout();
  const { toast } = useToast();

  // Check if we're in preview/development mode - bypass auth for testing
  const isPreviewMode = window.location.hostname.includes('lovableproject.com') || 
                        window.location.hostname.includes('lovable.app') ||
                        window.location.hostname === 'localhost';

  const [boardName, setBoardName] = useState('');
  const [boardColor, setBoardColor] = useState('#0079bf');
  const [boardThemeId, setBoardThemeId] = useState<string | null>(null);
  const [boardTheme, setBoardTheme] = useState<BoardTheme | null>(null);
  const [columns, setColumns] = useState<DbColumn[]>([]);
  const [cards, setCards] = useState<DbCard[]>([]);
  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [cardLabels, setCardLabels] = useState<DbCardLabel[]>([]);
  const [cardAttachments, setCardAttachments] = useState<{ id: string; card_id: string; file_name: string; file_url: string; file_size: number | null; file_type: string | null; uploaded_by: string | null; created_at: string }[]>([]);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'viewer' | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingCard, setEditingCard] = useState<{ card: CardType; columnId: string } | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const { ref: dragScrollRef, isDragging, isSpaceHeld } = useDragScroll<HTMLDivElement>();
  

  useEffect(() => {
    // Skip auth redirect in preview mode
    if (isPreviewMode) return;
    
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate, isPreviewMode]);

  useEffect(() => {
    // In preview mode, fetch board data even without user
    if ((user || isPreviewMode) && boardId) {
      fetchBoardData();
    }
  }, [user, boardId, isPreviewMode]);

  // Memoize column IDs to prevent unnecessary subscription recreation
  const columnIds = useMemo(() => columns.map(c => c.id), [columns]);
  const columnIdsRef = useRef<string[]>([]);
  columnIdsRef.current = columnIds;

  // Realtime subscription for cards - updates UI instantly without refresh
  useEffect(() => {
    if (!boardId || (!user && !isPreviewMode)) return;
    
    const channel = supabase
      .channel(`board-${boardId}-cards-realtime`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cards',
        },
        (payload) => {
          const newCard = payload.new as DbCard;
          // Use ref to get latest columnIds
          if (columnIdsRef.current.length === 0 || columnIdsRef.current.includes(newCard.column_id)) {
            setCards(prev => {
              if (prev.some(c => c.id === newCard.id)) return prev;
              return [...prev, newCard];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cards',
        },
        (payload) => {
          const updatedCard = payload.new as DbCard;
          setCards(prev => {
            // Check if card exists in our list
            const existingCard = prev.find(c => c.id === updatedCard.id);
            if (!existingCard) return prev;
            
            // Deep compare all relevant fields - return same array reference if no change
            // This prevents unnecessary re-renders when optimistic update already applied
            const hasChange = 
              existingCard.title !== updatedCard.title ||
              existingCard.description !== updatedCard.description ||
              existingCard.due_date !== updatedCard.due_date ||
              existingCard.position !== updatedCard.position ||
              existingCard.column_id !== updatedCard.column_id ||
              existingCard.color !== updatedCard.color;
            
            if (!hasChange) {
              return prev; // No change, return same reference to avoid re-render
            }
            
            // Create new array only if there's an actual change
            return prev.map(c => c.id === updatedCard.id ? updatedCard : c);
          });
          // Update editing card modal if it's the one being edited by another user
          setEditingCard(prev => {
            if (prev && prev.card.id === updatedCard.id) {
              return {
                ...prev,
                card: {
                  ...prev.card,
                  title: updatedCard.title,
                  description: updatedCard.description || undefined,
                  dueDate: updatedCard.due_date || undefined,
                  color: updatedCard.color,
                }
              };
            }
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'cards',
        },
        (payload) => {
          const deletedCard = payload.old as DbCard;
          setCards(prev => prev.filter(c => c.id !== deletedCard.id));
          // Close modal if the deleted card was being edited
          setEditingCard(prev => {
            if (prev && prev.card.id === deletedCard.id) {
              return null;
            }
            return prev;
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('Realtime subscription error:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, user, isPreviewMode]);

  // Realtime subscription for columns - syncs column changes including color
  useEffect(() => {
    if (!boardId || (!user && !isPreviewMode)) return;
    
    const channel = supabase
      .channel(`board-${boardId}-columns-realtime`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'columns',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const newColumn = payload.new as DbColumn;
          setColumns(prev => {
            if (prev.some(c => c.id === newColumn.id)) return prev;
            return [...prev, newColumn];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'columns',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const updatedColumn = payload.new as DbColumn;
          setColumns(prev => {
            const existingColumn = prev.find(c => c.id === updatedColumn.id);
            if (!existingColumn) return prev;
            
            // Only update if column actually changed
            if (existingColumn.title === updatedColumn.title &&
                existingColumn.position === updatedColumn.position &&
                existingColumn.color === updatedColumn.color) {
              return prev;
            }
            return prev.map(c => c.id === updatedColumn.id ? updatedColumn : c);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'columns',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const deletedColumn = payload.old as DbColumn;
          setColumns(prev => prev.filter(c => c.id !== deletedColumn.id));
          // Also remove cards from the deleted column
          setCards(prev => prev.filter(c => c.column_id !== deletedColumn.id));
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('Column realtime subscription error:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, user, isPreviewMode]);

  // Realtime subscription for board_members changes (UPDATE only - broadcasts handle add/remove for current user)
  useEffect(() => {
    if (!boardId || !user || isPreviewMode) return;

    const channel = supabase
      .channel(`board-${boardId}-members-realtime`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'board_members',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const updatedMembership = payload.new as { board_id: string; user_id: string; role: string };
          if (updatedMembership?.user_id === user.id) {
            setUserRole(updatedMembership.role as 'admin' | 'manager' | 'viewer');
          }
          refreshBoardMembers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, user, isPreviewMode]);

  // Listen for board_members DELETE events to detect when current user is removed
  useEffect(() => {
    if (!boardId || !user || isPreviewMode) return;

    console.log('BoardPage: Setting up member change listener for board:', boardId, 'user:', user.id);

    const channel = supabase
      .channel(`board-${boardId}-member-removal-detection`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'board_members',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          console.log('BoardPage: Received DELETE event payload:', JSON.stringify(payload));
          const deletedMember = payload.old as { board_id?: string; user_id?: string; id?: string };
          console.log('BoardPage: Deleted member:', deletedMember, 'Current user:', user.id);
          
          // Check if current user was removed
          if (deletedMember?.user_id === user.id) {
            console.log('BoardPage: Current user was removed, showing toast and navigating to home');
            // Show toast immediately before redirect
            toast({
              title: 'Access removed',
              description: 'You have been removed from this board.',
              variant: 'destructive',
            });
            // Navigate to home with state
            navigate('/', { 
              state: { 
                removedFromBoard: {
                  board_id: boardId,
                  workspace_id: workspaceId,
                  timestamp: Date.now()
                }
              }
            });
          } else {
            console.log('BoardPage: Another member was removed, refreshing members list');
            // Another member was removed, refresh members list
            refreshBoardMembers();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'board_members',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          console.log('BoardPage: Received INSERT event:', payload);
          const newMember = payload.new as { board_id: string; user_id: string };
          // If someone else was added, refresh members list
          if (newMember.user_id !== user.id) {
            refreshBoardMembers();
          }
        }
      )
      .subscribe((status, err) => {
        console.log('BoardPage: Member change subscription status:', status, err || '');
      });

    return () => {
      console.log('BoardPage: Cleaning up member change listener');
      supabase.removeChannel(channel);
    };
  }, [boardId, user, isPreviewMode, navigate, workspaceId, toast]);

  const fetchBoardData = async () => {
    if (!boardId) return;
    
    // In preview mode without user, use a mock user ID
    const effectiveUserId = user?.id || (isPreviewMode ? '00000000-0000-0000-0000-000000000000' : null);
    if (!effectiveUserId) return;
    
    setLoading(true);

    try {
      // Single server-side call to get all board data
      const { data, error } = await supabase.rpc('get_board_data', {
        _board_id: boardId,
        _user_id: effectiveUserId
      });

      if (error) throw error;
      
      // Cast JSON response to typed object
      const result = data as {
        error?: string;
        board?: { id: string; name: string; description: string | null; background_color: string | null; workspace_id: string };
        user_role?: string | null;
        columns?: DbColumn[];
        cards?: DbCard[];
        labels?: DbLabel[];
        card_labels?: DbCardLabel[];
        members?: Array<{ user_id: string; role: string; profiles: { id: string; email: string | null; full_name: string | null; avatar_url: string | null } }>;
      };
      
      if (result?.error) {
        if (result.error === 'Board not found') {
          toast({ title: 'Board not found', variant: 'destructive' });
          navigate('/');
          return;
        }
        throw new Error(result.error);
      }

      // Set all state from single response
      setBoardName(result.board?.name || '');
      setBoardColor(result.board?.background_color || '#0079bf');
      setWorkspaceId(result.board?.workspace_id || null);
      setUserRole(result.user_role as 'admin' | 'manager' | 'viewer' | null);
      setColumns(result.columns || []);

      // Fetch theme_id and theme data separately (not in RPC response)
      const { data: boardData } = await supabase
        .from('boards')
        .select('theme_id')
        .eq('id', boardId)
        .single();
      
      const themeId = boardData?.theme_id || null;
      setBoardThemeId(themeId);
      
      // Fetch full theme data if theme is set
      if (themeId) {
        const { data: themeData } = await supabase
          .from('board_themes')
          .select('*')
          .eq('id', themeId)
          .single();
        setBoardTheme(themeData as BoardTheme | null);
      } else {
        setBoardTheme(null);
      }
      
      setCards(result.cards || []);
      setLabels(result.labels || []);
      setCardLabels(result.card_labels || []);

      // Fetch card attachments
      const cardIds = (result.cards || []).map((c: DbCard) => c.id);
      if (cardIds.length > 0) {
        const { data: attachments } = await supabase
          .from('card_attachments')
          .select('*')
          .in('card_id', cardIds);
        setCardAttachments(attachments || []);
      }
      
      // Transform members to expected format
      const transformedMembers: BoardMember[] = (result.members || []).map((m) => ({
        user_id: m.user_id,
        role: m.role as 'admin' | 'manager' | 'viewer',
        profiles: {
          id: m.profiles.id,
          email: m.profiles.email || '',
          full_name: m.profiles.full_name,
          avatar_url: m.profiles.avatar_url,
        }
      }));
      setBoardMembers(transformedMembers);

    } catch (error: any) {
      console.error('Error fetching board:', error);
      toast({ title: 'Error loading board', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Lightweight member refresh without triggering full page loading state
  const refreshBoardMembers = async () => {
    if (!boardId || !user) return;
    try {
      const { data, error } = await supabase.rpc('get_board_member_profiles', {
        _board_id: boardId
      });

      if (error) throw error;

      const transformedMembers: BoardMember[] = (data || []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role as 'admin' | 'manager' | 'viewer',
        profiles: {
          id: m.id,
          email: m.email || '',
          full_name: m.full_name,
          avatar_url: m.avatar_url,
        }
      }));
      setBoardMembers(transformedMembers);
    } catch (error: any) {
      console.error('Error refreshing members:', error);
    }
  };

  // Lightweight theme refresh - updates theme without triggering loading state
  const refreshBoardTheme = async () => {
    if (!boardId) return;
    try {
      const { data: boardData } = await supabase
        .from('boards')
        .select('theme_id, background_color')
        .eq('id', boardId)
        .single();
      
      const themeId = boardData?.theme_id || null;
      setBoardThemeId(themeId);
      setBoardColor(boardData?.background_color || '#0079bf');
      
      if (themeId) {
        const { data: themeData } = await supabase
          .from('board_themes')
          .select('*')
          .eq('id', themeId)
          .single();
        setBoardTheme(themeData as BoardTheme | null);
      } else {
        setBoardTheme(null);
      }
    } catch (error: any) {
      console.error('Error refreshing theme:', error);
    }
  };

  // Lightweight background refresh - updates background without triggering loading state
  const refreshBoardBackground = async () => {
    if (!boardId) return;
    try {
      const { data: boardData } = await supabase
        .from('boards')
        .select('background_color')
        .eq('id', boardId)
        .single();
      
      setBoardColor(boardData?.background_color || '#0079bf');
    } catch (error: any) {
      console.error('Error refreshing background:', error);
    }
  };

  // Lightweight labels refresh - updates labels without triggering loading state
  const refreshLabels = async () => {
    if (!boardId) return;
    try {
      const { data: labelsData, error } = await supabase
        .from('labels')
        .select('*')
        .eq('board_id', boardId);
      
      if (error) throw error;
      setLabels(labelsData || []);
    } catch (error: any) {
      console.error('Error refreshing labels:', error);
    }
  };

  // SECURITY NOTE: These do NOT provide security - all permissions
  // are enforced server-side via RLS policies. These checks only
  // hide UI elements to improve user experience.
  // App admins have full access to all boards
  // IMPORTANT: isPreviewMode is ONLY used for auth bypass during local development,
  // NOT for granting edit permissions - permissions are based on actual user role
  const canEdit = userRole === 'admin' || isAppAdmin;
  const canManageMembers = userRole === 'admin' || userRole === 'manager' || isAppAdmin;

  // Convert DB data to component format
  const getColumnCards = (columnId: string): CardType[] => {
    return cards
      .filter(c => c.column_id === columnId)
      .sort((a, b) => a.position - b.position)
      .map(c => ({
        id: c.id,
        title: c.title,
        description: c.description || undefined,
        labels: cardLabels
          .filter(cl => cl.card_id === c.id)
          .map(cl => {
            const label = labels.find(l => l.id === cl.label_id);
            if (!label) return null;
            return { 
              id: label.id, 
              color: label.color, 
              text: label.name || undefined 
            } as Label;
          })
          .filter((l): l is Label => l !== null),
        dueDate: c.due_date || undefined,
        createdAt: '',
        color: c.color,
      }));
  };

  // Color update functions
  const updateCardColor = async (cardId: string, color: string | null) => {
    if (!canEdit) return;
    try {
      await supabase.from('cards').update({ color }).eq('id', cardId);
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, color } : c));
    } catch (error: any) {
      console.error('Update card color error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const applyCardColorToAll = async (color: string | null) => {
    if (!canEdit || !boardId) return;
    try {
      const cardIds = cards.map(c => c.id);
      await supabase.from('cards').update({ color }).in('id', cardIds);
      setCards(prev => prev.map(c => ({ ...c, color })));
      toast({ title: 'Success', description: 'Applied colour to all cards' });
    } catch (error: any) {
      console.error('Apply card color to all error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const updateColumnColor = async (columnId: string, color: string | null, isClearing = false) => {
    if (!canEdit) return;
    try {
      // When isClearing is true, save as null to use theme default
      // When color is null from ColorPicker (transparent selection), save as empty string
      // Empty string means "explicitly transparent", null means "use theme default"
      const colorToSave = isClearing ? null : (color === null ? '' : color);
      await supabase.from('columns').update({ color: colorToSave }).eq('id', columnId);
      setColumns(prev => prev.map(c => c.id === columnId ? { ...c, color: colorToSave } : c));
    } catch (error: any) {
      console.error('Update column color error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const applyColumnColorToAll = async (color: string | null) => {
    if (!canEdit || !boardId) return;
    try {
      const columnIds = columns.map(c => c.id);
      // When color is null from ColorPicker (transparent selection), save as empty string
      const colorToSave = color === null ? '' : color;
      await supabase.from('columns').update({ color: colorToSave }).in('id', columnIds);
      setColumns(prev => prev.map(c => ({ ...c, color: colorToSave })));
      toast({ title: 'Success', description: 'Applied colour to all columns' });
    } catch (error: any) {
      console.error('Apply column color to all error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const onDragEnd = useCallback(async (result: DropResult) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit || !user || !boardId) return;
    
    const { destination, source, type, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'column') {
      const newColumns = Array.from(columns);
      const [removed] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, removed);

      // Update positions locally (optimistic)
      const updatedColumns = newColumns.map((col, idx) => ({ ...col, position: idx }));
      setColumns(updatedColumns);

      // Batch update in database (single server call)
      const updates = updatedColumns.map(col => ({ id: col.id, position: col.position }));
      await supabase.rpc('batch_update_column_positions', {
        _user_id: user.id,
        _board_id: boardId,
        _updates: updates
      });
      return;
    }

    // Card drag
    const sourceCards = cards.filter(c => c.column_id === source.droppableId).sort((a, b) => a.position - b.position);
    const destCards = source.droppableId === destination.droppableId
      ? sourceCards
      : cards.filter(c => c.column_id === destination.droppableId).sort((a, b) => a.position - b.position);

    const draggedCard = cards.find(c => c.id === draggableId);
    if (!draggedCard) return;

    // Remove from source
    const newSourceCards = sourceCards.filter(c => c.id !== draggableId);
    
    // Add to destination
    const newDestCards = source.droppableId === destination.droppableId
      ? newSourceCards
      : [...destCards];
    
    const updatedCard = { ...draggedCard, column_id: destination.droppableId };
    newDestCards.splice(destination.index, 0, updatedCard);

    // Build update list
    const allUpdates: { id: string; column_id: string; position: number }[] = [];
    newSourceCards.forEach((c, idx) => allUpdates.push({ id: c.id, column_id: c.column_id, position: idx }));
    newDestCards.forEach((c, idx) => allUpdates.push({ id: c.id, column_id: destination.droppableId, position: idx }));
    
    // Deduplicate
    const uniqueUpdates = allUpdates.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

    // Update local state (optimistic)
    setCards(prev => {
      const others = prev.filter(c => 
        c.column_id !== source.droppableId && c.column_id !== destination.droppableId
      );
      return [...others, ...uniqueUpdates.map(u => {
        const original = prev.find(c => c.id === u.id);
        return original ? { ...original, column_id: u.column_id, position: u.position } : null;
      }).filter((c): c is DbCard => c !== null)];
    });

    // Batch update in database (single server call)
    await supabase.rpc('batch_update_card_positions', {
      _user_id: user.id,
      _updates: uniqueUpdates
    });
  }, [columns, cards, canEdit, user, boardId]);
  
  // Column reorder handler for mobile carousel dot drag
  const reorderColumns = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!canEdit || !user || !boardId) return;
    if (fromIndex === toIndex) return;
    
    const newColumns = Array.from(columns);
    const [removed] = newColumns.splice(fromIndex, 1);
    newColumns.splice(toIndex, 0, removed);

    // Update positions locally (optimistic)
    const updatedColumns = newColumns.map((col, idx) => ({ ...col, position: idx }));
    setColumns(updatedColumns);

    // Batch update in database (single server call)
    const updates = updatedColumns.map(col => ({ id: col.id, position: col.position }));
    await supabase.rpc('batch_update_column_positions', {
      _user_id: user.id,
      _board_id: boardId,
      _updates: updates
    });
  }, [columns, canEdit, user, boardId]);

  const addColumn = async () => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!boardId || !canEdit) return;

    try {
      // Validate input
      const validated = columnSchema.parse({ title: newColumnTitle });

      const position = columns.length;
      const { data, error } = await supabase
        .from('columns')
        .insert({ board_id: boardId, title: validated.title, position })
        .select()
        .single();

      if (error) throw error;
      setColumns([...columns, data]);
      setNewColumnTitle('');
      setIsAddingColumn(false);
    } catch (error: any) {
      console.error('Add column error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const updateColumnTitle = async (columnId: string, title: string) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit) return;
    try {
      // Validate input
      const validated = columnSchema.parse({ title });
      
      await supabase.from('columns').update({ title: validated.title }).eq('id', columnId);
      setColumns(columns.map(c => c.id === columnId ? { ...c, title: validated.title } : c));
    } catch (error: any) {
      console.error('Update column error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const deleteColumn = async (columnId: string) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit) return;
    try {
      await supabase.from('columns').delete().eq('id', columnId);
      setColumns(columns.filter(c => c.id !== columnId));
      setCards(cards.filter(c => c.column_id !== columnId));
    } catch (error: any) {
      console.error('Delete column error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const addCard = async (columnId: string, title: string) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit) return;
    try {
      // Validate input
      const validated = cardSchema.parse({ title });
      
      const columnCards = cards.filter(c => c.column_id === columnId);
      const position = columnCards.length;
      
      const { data, error } = await supabase
        .from('cards')
        .insert({ column_id: columnId, title: validated.title, position, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      setCards([...cards, data]);
    } catch (error: any) {
      console.error('Add card error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const updateCard = async (cardId: string, updates: Partial<CardType>) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit || !user) return;
    try {
      // Validate input if title or description provided
      if (updates.title !== undefined || updates.description !== undefined) {
        cardSchema.partial().parse({
          title: updates.title,
          description: updates.description,
        });
      }
      
      // Optimistic update BEFORE the RPC call to prevent flash
      // This ensures the card updates immediately in the UI
      setCards(prev => prev.map(c => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          ...(updates.title !== undefined && { title: updates.title }),
          ...(updates.description !== undefined && { description: updates.description || null }),
          ...('dueDate' in updates && { due_date: updates.dueDate || null }),
        };
      }));
      
      // Use server-side function for update (triggers realtime for all users)
      // Check if dueDate is explicitly null (meaning clear it) vs undefined (meaning don't update)
      const clearDueDate = 'dueDate' in updates && updates.dueDate === null;
      
      const { data, error } = await supabase.rpc('update_card', {
        _user_id: user.id,
        _card_id: cardId,
        _title: updates.title || null,
        _description: updates.description || null,
        _due_date: updates.dueDate || null,
        _clear_due_date: clearDueDate
      });

      if (error) throw error;
      
      const result = data as { error?: string; success?: boolean; card?: DbCard };
      if (result?.error) {
        throw new Error(result.error);
      }
      // Realtime subscription will handle syncing if needed
      // No need to call setCards again here - the optimistic update is already done
    } catch (error: any) {
      console.error('Update card error:', error);
      // Revert optimistic update on error by refetching
      fetchBoardData();
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const deleteCard = async (cardId: string) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit) return;
    try {
      await supabase.from('cards').delete().eq('id', cardId);
      setCards(cards.filter(c => c.id !== cardId));
      setCardLabels(cardLabels.filter(cl => cl.card_id !== cardId));
    } catch (error: any) {
      console.error('Delete card error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const addLabelToCard = async (cardId: string, label: Label) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit || !boardId) return;
    try {
      // Check if label exists or create new one
      let labelId = label.id;
      const existingLabel = labels.find(l => l.id === label.id);
      
      if (!existingLabel) {
        const { data: newLabel, error: labelError } = await supabase
          .from('labels')
          .insert({ board_id: boardId, name: label.text, color: label.color })
          .select()
          .single();

        if (labelError) throw labelError;
        labelId = newLabel.id;
        setLabels([...labels, newLabel]);
      }

      // Add card-label relation
      const { error } = await supabase
        .from('card_labels')
        .insert({ card_id: cardId, label_id: labelId });

      if (error && !error.message.includes('duplicate')) throw error;
      
      setCardLabels([...cardLabels, { card_id: cardId, label_id: labelId }]);
    } catch (error: any) {
      console.error('Add label error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const removeLabelFromCard = async (cardId: string, labelId: string) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!canEdit) return;
    try {
      await supabase.from('card_labels').delete().eq('card_id', cardId).eq('label_id', labelId);
      setCardLabels(cardLabels.filter(cl => !(cl.card_id === cardId && cl.label_id === labelId)));
    } catch (error: any) {
      console.error('Remove label error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check if background is an image URL
  const isImageBackground = boardColor.startsWith('http://') || boardColor.startsWith('https://') || boardColor.startsWith('data:');
  
  const containerStyle: React.CSSProperties = isImageBackground
    ? {
        backgroundImage: `url(${boardColor})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : {
        backgroundColor: sanitizeColor(boardColor),
      };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={containerStyle}>
      {/* Header - apply theme navbar color */}
      <header 
        className="flex-shrink-0 z-10 backdrop-blur-sm"
        style={{ 
          backgroundColor: boardTheme?.navbar_color 
            ? sanitizeColor(boardTheme.navbar_color) 
            : 'rgba(0, 0, 0, 0.2)' 
        }}
      >
        <div className={cn(
          "px-3 py-2 flex items-center justify-between",
          "md:px-4 md:py-3"
        )}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-white hover:bg-white/20 shrink-0 h-9 w-9 md:h-10 md:w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              {appSettings?.custom_board_logo_enabled && appSettings?.custom_board_logo_url ? (
                <img
                  src={appSettings.custom_board_logo_url}
                  alt="Logo"
                  style={{ width: appSettings.custom_board_logo_size, height: appSettings.custom_board_logo_size }}
                  className="object-contain shrink-0"
                />
              ) : (
                <LayoutGrid 
                  className="h-5 w-5 shrink-0 hidden sm:block" 
                  style={{ color: boardTheme?.board_icon_color || 'white' }}
                />
              )}
              <h1 className="text-base md:text-xl font-bold text-white truncate">{boardName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            {/* Desktop: Show all actions */}
            {isDesktop && (
              <>
                {boardId && canEdit && (
                  <InviteLinkButton boardId={boardId} canGenerateInvite={canEdit} />
                )}
                {canManageMembers && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={() => setSettingsModalOpen(true)}
                    title="Board Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="gap-2 text-white hover:bg-white/20">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.user_metadata?.avatar_url} />
                        <AvatarFallback className="bg-white/20">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden sm:inline">{user?.user_metadata?.full_name || user?.email}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    {isAppAdmin && (
                      <DropdownMenuItem onClick={() => navigate('/admin/config')}>
                        <Settings className="h-4 w-4 mr-2" />
                        Admin Settings
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={async () => {
                      await signOut();
                      navigate('/auth');
                    }}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            
            {/* Mobile/Tablet: Simplified actions with overflow menu */}
            {!isDesktop && (
              <>
                {canManageMembers && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-9 w-9"
                    onClick={() => setSettingsModalOpen(true)}
                    title="Board Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover w-56">
                    {boardId && canEdit && (
                      <InviteLinkButton boardId={boardId} canGenerateInvite={canEdit} />
                    )}
                    {isAppAdmin && (
                      <DropdownMenuItem onClick={() => navigate('/admin/config')}>
                        <Settings className="h-4 w-4 mr-2" />
                        Admin Settings
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={async () => {
                      await signOut();
                      navigate('/auth');
                    }}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Board content - responsive layout */}
      {isMobile ? (
        /* Mobile: Swipe carousel for columns */
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <MobileColumnCarousel
              columns={columns.map(column => ({
                id: column.id,
                title: column.title,
                cards: getColumnCards(column.id),
                color: column.color,
              }))}
              onUpdateColumnTitle={updateColumnTitle}
              onDeleteColumn={deleteColumn}
              onAddCard={addCard}
              onEditCard={(card, columnId) => setEditingCard({ card, columnId })}
              onDeleteCard={deleteCard}
              onUpdateColumnColor={updateColumnColor}
              onApplyColumnColorToAll={applyColumnColorToAll}
              onUpdateCardColor={updateCardColor}
              onApplyCardColorToAll={applyCardColorToAll}
              onReorderColumns={reorderColumns}
              onRefresh={fetchBoardData}
              disabled={!canEdit}
              themeColumnColor={boardTheme?.column_color}
              themeCardColor={boardTheme?.default_card_color}
              themeScrollbarColor={boardTheme?.scrollbar_color}
              themeScrollbarTrackColor={boardTheme?.scrollbar_track_color}
            />
            {/* Mobile Add Column FAB */}
            {canEdit && (
              <div className="absolute bottom-4 right-4">
                <Button
                  size="lg"
                  className="h-14 w-14 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setIsAddingColumn(true)}
                >
                  <Plus className="h-6 w-6" />
                </Button>
              </div>
            )}
          </div>
        </DragDropContext>
      ) : (
        /* Tablet & Desktop: Horizontal scroll layout */
        <div 
          ref={dragScrollRef} 
          className={cn(
            "flex-1 min-h-0 overflow-x-auto overflow-y-hidden",
            isDragging ? 'cursor-grabbing' : isSpaceHeld ? 'cursor-grab' : 'cursor-default'
          )}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: boardTheme 
              ? `${boardTheme.scrollbar_color} ${boardTheme.scrollbar_track_color}` 
              : undefined,
          }}
        >
          <style>{boardTheme ? `
            .board-scroll-area::-webkit-scrollbar { width: 8px; height: 8px; }
            .board-scroll-area::-webkit-scrollbar-track { background: ${boardTheme.scrollbar_track_color}; }
            .board-scroll-area::-webkit-scrollbar-thumb { background: ${boardTheme.scrollbar_color}; border-radius: 4px; }
          ` : ''}</style>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="board" type="column" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "drag-scroll-area board-scroll-area flex items-start gap-3 md:gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-4 md:pb-6 min-h-full",
                    isTablet ? "min-w-0" : "min-w-max"
                  )}
                >
                  {columns.map((column, index) => (
                    <KanbanColumn
                      key={column.id}
                      column={{
                        id: column.id,
                        title: column.title,
                        cards: getColumnCards(column.id),
                        color: column.color,
                      }}
                      index={index}
                      onUpdateTitle={(title) => updateColumnTitle(column.id, title)}
                      onDelete={() => deleteColumn(column.id)}
                      onAddCard={(title) => addCard(column.id, title)}
                      onEditCard={(card) => setEditingCard({ card, columnId: column.id })}
                      onDeleteCard={(cardId) => deleteCard(cardId)}
                      onUpdateColumnColor={(color, isClearing) => updateColumnColor(column.id, color, isClearing)}
                      onApplyColumnColorToAll={applyColumnColorToAll}
                      onUpdateCardColor={updateCardColor}
                      onApplyCardColorToAll={applyCardColorToAll}
                      disabled={!canEdit}
                      themeColumnColor={boardTheme?.column_color}
                      themeCardColor={boardTheme?.default_card_color}
                      themeScrollbarColor={boardTheme?.scrollbar_color}
                      themeScrollbarTrackColor={boardTheme?.scrollbar_track_color}
                    />
                  ))}
                  {provided.placeholder}

                  {/* Add Column */}
                  {canEdit && (
                    <div className={cn(
                      "shrink-0",
                      isTablet ? "w-64" : "w-72"
                    )}>
                      {isAddingColumn ? (
                        <div className="bg-column rounded-xl p-3 animate-scale-in">
                          <Input
                            value={newColumnTitle}
                            onChange={(e) => setNewColumnTitle(e.target.value)}
                            placeholder="Enter list title..."
                            className="mb-2"
                            autoFocus
                            maxLength={100}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addColumn();
                              if (e.key === 'Escape') {
                                setIsAddingColumn(false);
                                setNewColumnTitle('');
                              }
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={addColumn}>Add List</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setIsAddingColumn(false); setNewColumnTitle(''); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          className="w-full justify-start bg-white/20 hover:bg-white/30 text-white rounded-xl h-12"
                          onClick={() => setIsAddingColumn(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add another list
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      {/* Mobile Add Column Dialog */}
      {isMobile && isAddingColumn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-background w-full rounded-t-xl p-4 animate-slide-in-bottom">
            <h3 className="text-lg font-semibold mb-3">Add New List</h3>
            <Input
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              placeholder="Enter list title..."
              className="mb-3"
              autoFocus
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addColumn();
                if (e.key === 'Escape') {
                  setIsAddingColumn(false);
                  setNewColumnTitle('');
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button className="flex-1 h-11" onClick={addColumn}>Add List</Button>
              <Button variant="outline" className="flex-1 h-11" onClick={() => { setIsAddingColumn(false); setNewColumnTitle(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card Detail Modal */}
      <CardDetailModal
        card={editingCard?.card || null}
        open={!!editingCard}
        onClose={() => setEditingCard(null)}
        onSave={(updates) => {
          if (editingCard) {
            updateCard(editingCard.card.id, updates);
            // Update local state for immediate feedback
            setEditingCard({
              ...editingCard,
              card: {
                ...editingCard.card,
                ...updates,
              },
            });
          }
        }}
        onAddLabel={(label) => {
          if (editingCard) {
            addLabelToCard(editingCard.card.id, label);
            setEditingCard({
              ...editingCard,
              card: {
                ...editingCard.card,
                labels: [...editingCard.card.labels, label],
              },
            });
          }
        }}
        onRemoveLabel={(labelId) => {
          if (editingCard) {
            removeLabelFromCard(editingCard.card.id, labelId);
            setEditingCard({
              ...editingCard,
              card: {
                ...editingCard.card,
                labels: editingCard.card.labels.filter((l) => l.id !== labelId),
              },
            });
          }
        }}
        onDelete={() => {
          if (editingCard) {
            deleteCard(editingCard.card.id);
          }
        }}
        disabled={!canEdit}
        boardLabels={labels}
        attachments={editingCard ? cardAttachments.filter(a => a.card_id === editingCard.card.id) : []}
        onAttachmentsChange={async () => {
          if (editingCard) {
            const { data } = await supabase
              .from('card_attachments')
              .select('*')
              .eq('card_id', editingCard.card.id);
            setCardAttachments(prev => [
              ...prev.filter(a => a.card_id !== editingCard.card.id),
              ...(data || [])
            ]);
          }
        }}
        themeCardWindowColor={boardTheme?.card_window_color}
        themeCardWindowTextColor={boardTheme?.card_window_text_color}
        themeCardWindowButtonColor={boardTheme?.card_window_button_color}
        themeCardWindowButtonTextColor={boardTheme?.card_window_button_text_color}
        themeCardWindowButtonHoverColor={boardTheme?.card_window_button_hover_color}
        themeCardWindowButtonHoverTextColor={boardTheme?.card_window_button_hover_text_color}
        themeCardWindowIntelligentContrast={boardTheme?.card_window_intelligent_contrast}
      />

      {/* Board Settings Modal */}
      {boardId && (
        <BoardSettingsModal
          open={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          boardId={boardId}
          members={boardMembers}
          userRole={userRole}
          currentUserId={user?.id || null}
          currentThemeId={boardThemeId}
          currentTheme={boardTheme}
          currentBackgroundColor={isImageBackground ? '#0079bf' : boardColor}
          currentBackgroundImageUrl={isImageBackground ? boardColor : null}
          labels={labels}
          onMembersChange={refreshBoardMembers}
          onThemeChange={refreshBoardTheme}
          onBackgroundChange={refreshBoardBackground}
          onLabelsChange={refreshLabels}
        />
      )}
    </div>
  );
}
