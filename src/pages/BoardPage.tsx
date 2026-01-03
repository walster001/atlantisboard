import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { usePermissionsRealtime } from '@/hooks/usePermissionsRealtime';
import { usePermissions } from '@/hooks/usePermissions';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { MobileColumnCarousel } from '@/components/kanban/MobileColumnCarousel';
import { CardDetailModal } from '@/components/kanban/CardDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, ArrowLeft, Loader2, LayoutGrid, LogOut, User, Settings, MoreVertical, ShieldAlert } from 'lucide-react';
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
import { subscribeWorkspace } from '@/realtime/workspaceSubscriptions';
import type { RealtimePostgresChangesPayload } from '@/realtime/realtimeClient';
import { normalizeTimestamp, isNewer, isEqual } from '@/lib/timestampUtils';
interface DbColumn {
  id: string;
  boardId: string;
  title: string;
  position: number;
  color: string | null;
  updatedAt?: string;
}

interface DbCard {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  createdBy: string | null;
  color: string | null;
  updatedAt?: string;
}

interface DbLabel {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

interface DbCardLabel {
  cardId: string;
  labelId: string;
}


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

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAppAdmin, signOut } = useAuth();
  const { settings: appSettings } = useAppSettings();
  const { isMobile, isTablet, isDesktop } = useResponsiveLayout();
  const { toast } = useToast();

  const [boardName, setBoardName] = useState('');
  const [boardColor, setBoardColor] = useState('#0079bf');
  const [boardThemeId, setBoardThemeId] = useState<string | null>(null);
  const [boardTheme, setBoardTheme] = useState<BoardTheme | null>(null);
  const [columns, setColumns] = useState<DbColumn[]>([]);
  const [cards, setCards] = useState<DbCard[]>([]);
  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [cardLabels, setCardLabels] = useState<DbCardLabel[]>([]);
  const [cardAttachments, setCardAttachments] = useState<{ id: string; cardId: string; fileName: string; fileUrl: string; fileSize: number | null; fileType: string | null; uploadedBy: string | null; createdAt: string }[]>([]);
  const [cardSubtasks, setCardSubtasks] = useState<{ id: string; cardId: string; title: string; completed: boolean; completedAt: string | null; completedBy: string | null; position: number; checklistName: string | null; createdAt: string }[]>([]);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'viewer' | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [boardCreatedBy, setBoardCreatedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [editingCard, setEditingCard] = useState<{ card: CardType; columnId: string } | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const { ref: dragScrollRef, isDragging, isSpaceHeld } = useDragScroll<HTMLDivElement>();
  
  // Real-time permissions updates - triggers refetch when permissions change
  usePermissionsRealtime({
    boardId,
    workspaceId,
    onPermissionsUpdated: useCallback(() => {
      console.log('[BoardPage] Permissions updated, refetching board data...');
      fetchBoardData();
    }, []),
    onAccessRevoked: useCallback(() => {
      console.log('[BoardPage] Access revoked via permissions, redirecting...');
      navigate('/', {
        state: {
          permissionsRevoked: {
            board_id: boardId,
            timestamp: Date.now()
          }
        }
      });
    }, [boardId, navigate]),
  });

  // Lightweight member refresh without triggering full page loading state
  // Defined here before useEffect to avoid hoisting issues
  const refreshBoardMembers = useCallback(async () => {
    if (!boardId || !user) return;
    try {
      const { data, error } = await api.rpc('get_board_member_profiles', {
        _board_id: boardId
      });

      if (error) throw error;

      const transformedMembers: BoardMember[] = (Array.isArray(data) ? data : []).map((m: any) => ({
        userId: m.userId,
        role: m.role as 'admin' | 'manager' | 'viewer',
        profiles: {
          id: m.profiles?.id ?? m.userId,
          email: m.profiles?.email || '',
          fullName: m.profiles?.fullName ?? null,
          avatarUrl: m.profiles?.avatarUrl ?? null,
        }
      }));
      console.log('[BoardPage] Refreshing board members, new count:', transformedMembers.length);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:150',message:'setBoardMembers called',data:{boardId,memberCount:transformedMembers.length,memberIds:transformedMembers.map(m=>m.userId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setBoardMembers(transformedMembers);
      console.log('[BoardPage] Board members state updated');
    } catch (error: any) {
      console.error('Error refreshing members:', error);
    }
  }, [boardId, user]);

  // Main board data fetch - defined here before useEffect to avoid hoisting issues
  const fetchBoardData = useCallback(async () => {
    if (!boardId) return;
    
    if (!user?.id) return;
    
    setLoading(true);

    try {
      // Single server-side call to get all board data
      const { data, error } = await api.rpc('get_board_data', {
        _board_id: boardId,
        _user_id: user.id
      });

      if (error) throw error;
      
      // Cast JSON response to typed object
      const result = data as {
        error?: string;
        board?: { id: string; name: string; description: string | null; backgroundColor: string | null; workspaceId: string; createdBy: string | null };
        userRole?: string | null;
        columns?: DbColumn[];
        cards?: DbCard[];
        labels?: DbLabel[];
        cardLabels?: DbCardLabel[];
        members?: Array<{ userId: string; role: string; profiles: { id: string; email: string | null; fullName: string | null; avatarUrl: string | null } }>;
      };
      
      if (result?.error) {
        if (result.error === 'Board not found') {
          toast({ title: 'Board not found', variant: 'destructive' });
          navigate('/');
          return;
        }
        if (result.error === 'Access denied') {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        throw new Error(result.error);
      }

      // Set all state from single response
      setBoardName(result.board?.name || '');
      setBoardColor(result.board?.backgroundColor || '#0079bf');
      setWorkspaceId(result.board?.workspaceId || null);
      setBoardCreatedBy(result.board?.createdBy || null);
      setUserRole(result.userRole as 'admin' | 'manager' | 'viewer' | null);
      setColumns(result.columns || []);
      // Mark columns as loaded
      columnsLoadedRef.current = true;

      // Fetch themeId and theme data separately (not in RPC response)
      const boardDataResult = await api
        .from('boards')
        .select('themeId')
        .eq('id', boardId)
        .single();
      
      const themeId = (boardDataResult.data as { themeId?: string | null } | null)?.themeId || null;
      setBoardThemeId(themeId);
      
      // Fetch full theme data if theme is set
      if (themeId) {
        const themeDataResult = await api
          .from('board_themes')
          .select('*')
          .eq('id', themeId)
          .single();
        // Transform snake_case to camelCase for BoardTheme
        const themeRow = themeDataResult.data as any;
        if (themeRow) {
          const theme: BoardTheme = {
            id: themeRow.id,
            name: themeRow.name,
            isDefault: themeRow.is_default,
            navbarColor: themeRow.navbar_color,
            columnColor: themeRow.column_color,
            defaultCardColor: themeRow.default_card_color,
            cardWindowColor: themeRow.card_window_color,
            cardWindowTextColor: themeRow.card_window_text_color,
            cardWindowButtonColor: themeRow.card_window_button_color,
            cardWindowButtonTextColor: themeRow.card_window_button_text_color,
            cardWindowButtonHoverColor: themeRow.card_window_button_hover_color,
            cardWindowButtonHoverTextColor: themeRow.card_window_button_hover_text_color,
            cardWindowIntelligentContrast: themeRow.card_window_intelligent_contrast,
            homepageBoardColor: themeRow.homepage_board_color,
            boardIconColor: themeRow.board_icon_color,
            scrollbarColor: themeRow.scrollbar_color,
            scrollbarTrackColor: themeRow.scrollbar_track_color,
            createdBy: themeRow.created_by,
            createdAt: themeRow.created_at,
            updatedAt: themeRow.updated_at,
          };
          setBoardTheme(theme);
        } else {
          setBoardTheme(null);
        }
      } else {
        setBoardTheme(null);
      }
      
      setCards(result.cards || []);
      setLabels(result.labels || []);
      setCardLabels(result.cardLabels || []);

      // Fetch card attachments and subtasks
      const cardIds = (result.cards || []).map((c: DbCard) => c.id);
      if (cardIds.length > 0) {
        const [attachmentsResult, subtasksResult] = await Promise.all([
          api
            .from('card_attachments')
            .select('*')
            .in('cardId', cardIds),
          api
            .from('card_subtasks')
            .select('*')
            .in('cardId', cardIds)
        ]);
        setCardAttachments((attachmentsResult.data as typeof cardAttachments) || []);
        setCardSubtasks((subtasksResult.data as typeof cardSubtasks) || []);
      }
      
      // Transform members to expected format
      const transformedMembers: BoardMember[] = (result.members || []).map((m) => ({
        userId: m.userId,
        role: m.role as 'admin' | 'manager' | 'viewer',
        profiles: {
          id: m.profiles.id,
          email: m.profiles.email || '',
          fullName: m.profiles.fullName ?? null,
          avatarUrl: m.profiles.avatarUrl ?? null,
        }
      }));
      setBoardMembers(transformedMembers);
      
      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching board data:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      setLoading(false);
    }
  }, [boardId, user, toast, navigate]);


  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && boardId) {
      fetchBoardData();
    }
  }, [user, boardId]);

  // Memoize column IDs to prevent unnecessary subscription recreation
  const columnIds = useMemo(() => columns.map(c => c.id), [columns]);
  const columnIdsRef = useRef<string[]>([]);
  columnIdsRef.current = columnIds;

  // Track pending optimistic card updates to prevent race conditions
  interface PendingCardUpdate {
    columnId: string;
    position: number;
    timestamp: number;
    updatedAt: number; // Normalized timestamp for conflict resolution
  }
  const pendingCardUpdatesRef = useRef<Map<string, PendingCardUpdate>>(new Map());

  // Buffer card events when columns are missing (event ordering safety)
  interface BufferedCardEvent {
    card: DbCard;
    event: RealtimePostgresChangesPayload<Record<string, unknown>>;
    timestamp: number;
  }
  const pendingCardEventsRef = useRef<BufferedCardEvent[]>([]);
  const columnsLoadedRef = useRef(false);

  // Process buffered card events when column state is ready
  const processBufferedCardEvents = useCallback(() => {
    if (pendingCardEventsRef.current.length === 0) return;
    
    const buffered = [...pendingCardEventsRef.current];
    pendingCardEventsRef.current = [];
    
    // Get current columns state
    const currentColumns = columns;
    
    buffered.forEach(({ card, event }) => {
      const cardData = card as unknown as DbCard;
      const cardColumnId = cardData.columnId;
      const columnBelongsToBoard = currentColumns.some((c) => c.id === cardColumnId);
      
      if (columnBelongsToBoard || currentColumns.length === 0) {
        // Column exists now, reprocess the event by calling the handler logic
        console.log('[BoardPage] Processing buffered card event:', {
          cardId: cardData.id,
          columnId: cardColumnId,
          eventType: event.eventType,
        });
        
        // Manually trigger the update logic
        if (event.eventType === 'INSERT') {
          setCards((prev) => {
            if (prev.some((c) => c.id === cardData.id)) {
              return prev;
            }
            const updated = [...prev, cardData];
            return updated.sort((a, b) => {
              if (a.columnId !== b.columnId) {
                return a.columnId.localeCompare(b.columnId);
              }
              return a.position - b.position;
            });
          });
        } else if (event.eventType === 'UPDATE') {
          const updatedCard = cardData;
          setCards((prev) => {
            const existingCard = prev.find((c) => c.id === updatedCard.id);
            if (!existingCard) {
              const updated = [...prev, updatedCard];
              return updated.sort((a, b) => {
                if (a.columnId !== b.columnId) {
                  return a.columnId.localeCompare(b.columnId);
                }
                return a.position - b.position;
              });
            }
            
            // Apply timestamp-based conflict resolution
            const incomingUpdatedAt = updatedCard.updatedAt || (updatedCard as any).updated_at;
            const incomingTimestamp = normalizeTimestamp(incomingUpdatedAt);
            const localTimestamp = normalizeTimestamp(existingCard.updatedAt);
            
            if (isNewer(localTimestamp, incomingTimestamp)) {
              return prev; // Keep local state
            }
            
            let updated = prev.map((c) => (c.id === updatedCard.id ? updatedCard : c));
            return updated.sort((a, b) => {
              if (a.columnId !== b.columnId) {
                return a.columnId.localeCompare(b.columnId);
              }
              return a.position - b.position;
            });
          });
        } else if (event.eventType === 'DELETE') {
          setCards((prev) => prev.filter((c) => c.id !== cardData.id));
        }
      } else {
        // Still missing, keep buffered but limit retries
        const age = Date.now() - (card as any).timestamp;
        if (age < 5000) { // Only keep events less than 5 seconds old
          pendingCardEventsRef.current.push({ card, event, timestamp: Date.now() });
        } else {
          console.warn('[BoardPage] Dropping buffered card event - column still missing after timeout:', {
            cardId: cardData.id,
            columnId: cardColumnId,
          });
        }
      }
    });
  }, [columns]);

  // Unified realtime subscription using workspace (parent-child hierarchy)
  useEffect(() => {
    if (!boardId || !workspaceId) return;

    const cleanups: Array<() => void> = [];

    // Subscribe to workspace - receives all child updates (boards, columns, cards, members)
    cleanups.push(
      subscribeWorkspace(workspaceId, {
        onBoardUpdate: (board, event) => {
          const boardData = board as { id?: string; workspaceId?: string };
          // Only process events for the current board
          if (boardData.id !== boardId) return;
          
          // If board is updated, refresh all children (parent refresh)
          if (event.eventType === 'UPDATE') {
            console.log('[BoardPage] Board UPDATE - refreshing all children');
            fetchBoardData();
          }
        },
        onColumnUpdate: (column, event) => {
          const columnData = column as unknown as DbColumn;
          // Only process events for columns in the current board
          if (columnData.boardId !== boardId) return;
          
          // Extract updatedAt (handle both camelCase and snake_case)
          const getUpdatedAt = (data: any): string | undefined => {
            return data?.updatedAt || data?.updated_at;
          };
          
          if (event.eventType === 'INSERT') {
            console.log('[BoardPage] Column INSERT event received:', columnData);
            setColumns((prev) => {
              if (prev.some((c) => c.id === columnData.id)) {
                console.log('[BoardPage] Column already in state, skipping insert');
                return prev;
              }
              console.log('[BoardPage] Adding new column to state:', columnData.id);
              const updated = [...prev, columnData];
              const sorted = updated.sort((a, b) => a.position - b.position);
              // Update columnIdsRef immediately
              columnIdsRef.current = sorted.map(c => c.id);
              // Process buffered card events now that column exists
              setTimeout(() => {
                processBufferedCardEvents();
              }, 50);
              return sorted;
            });
          } else if (event.eventType === 'UPDATE') {
            const updatedColumn = columnData;
            setColumns((prev) => {
              const existingColumn = prev.find((c) => c.id === updatedColumn.id);
              if (!existingColumn) {
                return prev;
              }
              
              // Timestamp-based conflict resolution for columns
              const incomingUpdatedAt = getUpdatedAt(updatedColumn);
              const incomingTimestamp = normalizeTimestamp(incomingUpdatedAt);
              const localUpdatedAt = getUpdatedAt(existingColumn);
              const localTimestamp = normalizeTimestamp(localUpdatedAt);
              
              // If local state is newer, keep it
              if (isNewer(localTimestamp, incomingTimestamp)) {
                console.log('[BoardPage] Column UPDATE ignored - local state is newer:', {
                  columnId: updatedColumn.id,
                  localTimestamp,
                  incomingTimestamp,
                });
                return prev;
              }
              
              // Check if anything actually changed (skip if no changes)
              if (
                existingColumn.title === updatedColumn.title &&
                existingColumn.position === updatedColumn.position &&
                existingColumn.color === updatedColumn.color
              ) {
                return prev;
              }
              
              const updated = prev.map((c) => (c.id === updatedColumn.id ? updatedColumn : c));
              const sorted = updated.sort((a, b) => a.position - b.position);
              // Update columnIdsRef immediately
              columnIdsRef.current = sorted.map(c => c.id);
              return sorted;
            });
          } else if (event.eventType === 'DELETE') {
            console.log('[BoardPage] Column DELETE event received:', columnData);
            setColumns((prev) => {
              const filtered = prev.filter((c) => c.id !== columnData.id);
              // Update columnIdsRef immediately
              columnIdsRef.current = filtered.map(c => c.id);
              return filtered;
            });
            setCards((prev) => prev.filter((c) => c.columnId !== columnData.id));
          }
        },
        onCardUpdate: (card, event) => {
          const cardData = card as unknown as DbCard;
          const cardColumnId = cardData.columnId;
          const columnBelongsToBoard = columns.some((c) => c.id === cardColumnId);
          
          // Event buffering: If column doesn't exist and columns have been loaded, buffer the event
          if (columnsLoadedRef.current && columns.length > 0 && !columnBelongsToBoard) {
            console.log('[BoardPage] Card event buffered - column not in board:', {
              cardId: cardData.id,
              columnId: cardColumnId,
              boardId,
              loadedColumns: columns.length,
            });
            pendingCardEventsRef.current.push({
              card: cardData,
              event,
              timestamp: Date.now(),
            });
            // Set timeout to process buffered events after a short delay
            setTimeout(() => {
              processBufferedCardEvents();
            }, 100);
            return;
          }
          
          // Extract updatedAt from event (handle both camelCase and snake_case)
          const getUpdatedAt = (data: any): string | undefined => {
            return data?.updatedAt || data?.updated_at;
          };
          
          if (event.eventType === 'INSERT') {
            console.log('[BoardPage] Card INSERT event received:', {
              cardId: cardData.id,
              columnId: cardData.columnId,
              columnBelongsToBoard,
            });
            setCards((prev) => {
              if (prev.some((c) => c.id === cardData.id)) {
                console.log('[BoardPage] Card already in state, skipping insert');
                return prev;
              }
              console.log('[BoardPage] Adding new card to state:', cardData.id);
              const updated = [...prev, cardData];
              // Sort cards by position within each column
              return updated.sort((a, b) => {
                if (a.columnId !== b.columnId) {
                  return a.columnId.localeCompare(b.columnId);
                }
                return a.position - b.position;
              });
            });
          } else if (event.eventType === 'UPDATE') {
            const updatedCard = cardData;
            const previous = event.old as unknown as DbCard;
            const previousColumnId = previous?.columnId;
            const columnChanged = previousColumnId && previousColumnId !== updatedCard.columnId;
            
            // Extract and normalize timestamps
            const incomingUpdatedAt = getUpdatedAt(updatedCard);
            const incomingTimestamp = normalizeTimestamp(incomingUpdatedAt);
            
            // Get local card state for comparison
            setCards((prev) => {
              const existingCard = prev.find((c) => c.id === updatedCard.id);
              
              // Check pending optimistic update
              const pendingUpdate = pendingCardUpdatesRef.current.get(updatedCard.id);
              
              if (pendingUpdate) {
                // Compare timestamps for conflict resolution
                const optimisticTimestamp = pendingUpdate.updatedAt;
                const localTimestamp = existingCard?.updatedAt ? normalizeTimestamp(existingCard.updatedAt) : 0;
                
                // If realtime event matches our optimistic state exactly, ignore it (echo suppression)
                if (pendingUpdate.columnId === updatedCard.columnId && 
                    pendingUpdate.position === updatedCard.position &&
                    isEqual(incomingTimestamp, optimisticTimestamp)) {
                  console.log('[BoardPage] Card UPDATE event ignored - matches optimistic state:', updatedCard.id);
                  pendingCardUpdatesRef.current.delete(updatedCard.id);
                  return prev;
                }
                
                // Timestamp-based conflict resolution
                if (isNewer(optimisticTimestamp, incomingTimestamp)) {
                  // Our optimistic update is newer - keep it, ignore incoming
                  console.log('[BoardPage] Card UPDATE event ignored - optimistic update is newer:', {
                    cardId: updatedCard.id,
                    optimisticTimestamp,
                    incomingTimestamp,
                  });
                  return prev;
                } else if (isNewer(incomingTimestamp, optimisticTimestamp)) {
                  // Incoming update is newer - accept it, clear optimistic
                  console.log('[BoardPage] Card UPDATE event accepted - incoming is newer:', {
                    cardId: updatedCard.id,
                    optimisticTimestamp,
                    incomingTimestamp,
                  });
                  pendingCardUpdatesRef.current.delete(updatedCard.id);
                } else {
                  // Timestamps equal or very close - check if it's our echo
                  if (pendingUpdate.columnId === updatedCard.columnId && pendingUpdate.position === updatedCard.position) {
                    console.log('[BoardPage] Card UPDATE event ignored - matches optimistic (equal timestamps):', updatedCard.id);
                    pendingCardUpdatesRef.current.delete(updatedCard.id);
                    return prev;
                  }
                  // Different state with equal timestamps - accept server state
                  console.log('[BoardPage] Card UPDATE event accepted - different state, equal timestamps:', {
                    cardId: updatedCard.id,
                    optimistic: pendingUpdate,
                    server: { columnId: updatedCard.columnId, position: updatedCard.position },
                  });
                  pendingCardUpdatesRef.current.delete(updatedCard.id);
                }
              } else if (existingCard) {
                // No pending optimistic update - compare with local state
                const localTimestamp = normalizeTimestamp(existingCard.updatedAt);
                if (isNewer(localTimestamp, incomingTimestamp)) {
                  // Local state is newer - keep it
                  console.log('[BoardPage] Card UPDATE event ignored - local state is newer:', {
                    cardId: updatedCard.id,
                    localTimestamp,
                    incomingTimestamp,
                  });
                  return prev;
                }
                // Incoming is newer or equal - accept it
              }
              
              // Apply the update
              if (!existingCard) {
                console.log('[BoardPage] Card UPDATE - card not found in state, adding it:', updatedCard.id);
                const updated = [...prev, updatedCard];
                // Sort cards by position within each column
                return updated.sort((a, b) => {
                  if (a.columnId !== b.columnId) {
                    return a.columnId.localeCompare(b.columnId);
                  }
                  return a.position - b.position;
                });
              }
              
              // Update the card
              let updated = prev.map((c) => (c.id === updatedCard.id ? updatedCard : c));
              
              // If column changed, we need to ensure proper sorting
              // Sort cards by position within each column
              updated = updated.sort((a, b) => {
                if (a.columnId !== b.columnId) {
                  return a.columnId.localeCompare(b.columnId);
                }
                return a.position - b.position;
              });
              
              return updated;
            });
            
            setEditingCard((prev) => {
              if (prev && prev.card.id === updatedCard.id) {
                return {
                  ...prev,
                  card: {
                    ...prev.card,
                    title: updatedCard.title,
                    description: updatedCard.description || undefined,
                    dueDate: updatedCard.dueDate || undefined,
                    color: updatedCard.color,
                  },
                };
              }
              return prev;
            });
          } else if (event.eventType === 'DELETE') {
            const deletedCard = cardData;
            setCards((prev) => prev.filter((c) => c.id !== deletedCard.id));
            setEditingCard((prev) => {
              if (prev && prev.card.id === deletedCard.id) {
                return null;
              }
              return prev;
            });
          }
        },
        onMemberUpdate: (member, event) => {
          const membership = member as { boardId?: string; userId?: string; role?: string; user?: { profile?: { fullName?: string | null; email?: string } } };
          // Only process events for members in the current board
          if (membership.boardId !== boardId) return;
          
          if (event.eventType === 'INSERT') {
            const newMembership = membership;
            refreshBoardMembers();
            if (newMembership.userId && newMembership.userId !== user?.id) {
              const memberName = newMembership.user?.profile?.fullName || 
                                newMembership.user?.profile?.email || 
                                'a member';
              const role = newMembership.role || 'viewer';
              toast({
                title: 'Member added',
                description: `${memberName} added as ${role}`,
              });
            }
          } else if (event.eventType === 'UPDATE') {
            const updatedMembership = membership;
            const previousMembership = event.old as { role?: string };
            refreshBoardMembers();
            
            if (updatedMembership?.userId === user?.id && updatedMembership.role) {
              const newRole = updatedMembership.role as 'admin' | 'manager' | 'viewer';
              const oldRole = userRole;
              setUserRole(newRole);
              
              if (newRole === 'viewer' && oldRole !== 'viewer') {
                console.log('[BoardPage] User demoted to viewer, closing settings dialogs');
                setSettingsModalOpen(false);
                setMembersDialogOpen(false);
                toast({
                  title: 'Access changed',
                  description: 'You have been demoted to viewer. Settings dialogs have been closed.',
                  variant: 'destructive',
                });
              } else if (newRole !== 'viewer' && oldRole === 'viewer') {
                toast({
                  title: 'Access granted',
                  description: `You have been promoted to ${newRole}. You can now access board settings.`,
                });
              }
            } else if (updatedMembership.userId && updatedMembership.userId !== user?.id) {
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
          } else if (event.eventType === 'DELETE') {
            const deletedMember = membership;
            // Handle both camelCase (userId) and snake_case (user_id) field names
            const deletedUserId = deletedMember?.userId ?? (deletedMember as any)?.user_id;
            
            console.log('[BoardPage] Member DELETE event received:', {
              deletedUserId,
              currentUserId: user?.id,
              matches: deletedUserId === user?.id,
            });
            
            if (deletedUserId === user?.id) {
              // Navigate first to ensure redirect happens even if toast fails
              navigate('/', {
                state: {
                  removedFromBoard: {
                    boardId: boardId,
                    workspaceId: workspaceId,
                    timestamp: Date.now(),
                  },
                },
              });
              
              // Show toast after navigation
              toast({
                title: 'Access removed',
                description: 'You have been removed from this board.',
                variant: 'destructive',
              });
            } else {
              refreshBoardMembers();
              if (deletedUserId) {
                const memberName = deletedMember.user?.profile?.fullName || 
                                  deletedMember.user?.profile?.email || 
                                  'a member';
                toast({
                  title: 'Member removed',
                  description: `${memberName} removed from board`,
                });
              }
            }
          }
        },
        onParentRefresh: (parentType, parentId) => {
          // When board updates, refresh all children
          if (parentType === 'board' && parentId === boardId) {
            console.log('[BoardPage] Parent refresh triggered for board:', parentId);
            fetchBoardData();
          }
        },
      })
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [boardId, workspaceId, user, refreshBoardMembers, navigate, toast, fetchBoardData, userRole]);

  // Process buffered card events when columns change
  useEffect(() => {
    if (columnsLoadedRef.current && columns.length > 0 && pendingCardEventsRef.current.length > 0) {
      // Small delay to ensure state is fully updated
      const timeoutId = setTimeout(() => {
        processBufferedCardEvents();
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [columns, processBufferedCardEvents]);

  // Lightweight theme refresh - updates theme without triggering loading state
  const refreshBoardTheme = async () => {
    if (!boardId) return;
    try {
      const boardDataResult = await api
        .from('boards')
        .select('themeId, backgroundColor')
        .eq('id', boardId)
        .single();
      
      const boardData = boardDataResult.data as { themeId?: string | null; backgroundColor?: string | null } | null;
      const themeId = boardData?.themeId || null;
      setBoardThemeId(themeId);
      setBoardColor(boardData?.backgroundColor || '#0079bf');
      
      if (themeId) {
        const themeDataResult = await api
          .from('board_themes')
          .select('*')
          .eq('id', themeId)
          .single();
        // Transform snake_case to camelCase for BoardTheme
        const themeRow = themeDataResult.data as any;
        if (themeRow) {
          const theme: BoardTheme = {
            id: themeRow.id,
            name: themeRow.name,
            isDefault: themeRow.is_default,
            navbarColor: themeRow.navbar_color,
            columnColor: themeRow.column_color,
            defaultCardColor: themeRow.default_card_color,
            cardWindowColor: themeRow.card_window_color,
            cardWindowTextColor: themeRow.card_window_text_color,
            cardWindowButtonColor: themeRow.card_window_button_color,
            cardWindowButtonTextColor: themeRow.card_window_button_text_color,
            cardWindowButtonHoverColor: themeRow.card_window_button_hover_color,
            cardWindowButtonHoverTextColor: themeRow.card_window_button_hover_text_color,
            cardWindowIntelligentContrast: themeRow.card_window_intelligent_contrast,
            homepageBoardColor: themeRow.homepage_board_color,
            boardIconColor: themeRow.board_icon_color,
            scrollbarColor: themeRow.scrollbar_color,
            scrollbarTrackColor: themeRow.scrollbar_track_color,
            createdBy: themeRow.created_by,
            createdAt: themeRow.created_at,
            updatedAt: themeRow.updated_at,
          };
          setBoardTheme(theme);
        } else {
          setBoardTheme(null);
        }
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
      const boardDataResult = await api
        .from('boards')
        .select('backgroundColor')
        .eq('id', boardId)
        .single();
      
      const boardData = boardDataResult.data as { backgroundColor?: string | null } | null;
      setBoardColor(boardData?.backgroundColor || '#0079bf');
    } catch (error: any) {
      console.error('Error refreshing background:', error);
    }
  };

  // Lightweight labels refresh - updates labels without triggering loading state
  const refreshLabels = async () => {
    if (!boardId) return;
    try {
      const labelsResult = await api
        .from('labels')
        .select('*')
        .eq('boardId', boardId);
      
      if (labelsResult.error) throw labelsResult.error;
      setLabels((labelsResult.data as DbLabel[]) || []);
    } catch (error: any) {
      console.error('Error refreshing labels:', error);
    }
  };

  // Use the permission system for UI checks
  // SECURITY NOTE: These do NOT provide security - all permissions
  // are enforced server-side via RLS policies. These checks only
  // hide UI elements to improve user experience.
  const { can, canEdit, canManageMembers, isAppAdmin: permissionsAppAdmin } = usePermissions(boardId, userRole);
  
  // App Admin has full access regardless of board membership
  const effectiveCanEdit = canEdit || isAppAdmin;
  const effectiveCanManage = canManageMembers || isAppAdmin;

  // Convert DB data to component format
  const getColumnCards = (columnId: string): CardType[] => {
    return cards
      .filter(c => c.columnId === columnId)
      .sort((a, b) => a.position - b.position)
      .map(c => ({
        id: c.id,
        title: c.title,
        description: c.description || undefined,
        labels: cardLabels
          .filter(cl => cl.cardId === c.id)
          .map(cl => {
            const label = labels.find(l => l.id === cl.labelId);
            if (!label) return null;
            return { 
              id: label.id, 
              color: label.color, 
              text: label.name || undefined 
            } as Label;
          })
          .filter((l): l is Label => l !== null),
        dueDate: c.dueDate || undefined,
        createdAt: '',
        color: c.color,
      }));
  };

  // Color update functions
  const updateCardColor = async (cardId: string, color: string | null) => {
    if (!effectiveCanEdit) return;
    try {
      // Use dedicated card route which emits realtime events
      // The generic db route doesn't emit events, so we use the PATCH endpoint
      const result = await api.request(`/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify({ color }),
      });
      if (result.error) throw result.error;
      // Realtime handler will update state when event is received
    } catch (error: any) {
      console.error('Update card color error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const applyCardColorToAll = async (color: string | null) => {
    if (!effectiveCanEdit || !boardId) return;
    try {
      const cardIds = cards.map(c => c.id);
      // Update each card individually using dedicated route to ensure realtime events are emitted
      // This ensures each card update emits a realtime event
      await Promise.all(
        cardIds.map(cardId =>
          api.request(`/cards/${cardId}`, {
            method: 'PATCH',
            body: JSON.stringify({ color }),
          })
        )
      );
      // Realtime handler will update state when events are received
      toast({ title: 'Success', description: 'Applied colour to all cards' });
    } catch (error: any) {
      console.error('Apply card color to all error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const updateColumnColor = async (columnId: string, color: string | null, isClearing = false) => {
    if (!effectiveCanEdit) return;
    try {
      // When isClearing is true, save as null to use theme default
      // When color is null from ColorPicker (transparent selection), save as empty string
      // Empty string means "explicitly transparent", null means "use theme default"
      const colorToSave = isClearing ? null : (color === null ? '' : color);
      // Use dedicated column route which emits realtime events
      const result = await api.request(`/columns/${columnId}`, {
        method: 'PATCH',
        body: JSON.stringify({ color: colorToSave }),
      });
      if (result.error) throw result.error;
      // Realtime handler will update state when event is received
    } catch (error: any) {
      console.error('Update column color error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const applyColumnColorToAll = async (color: string | null) => {
    if (!effectiveCanEdit || !boardId) return;
    try {
      const columnIds = columns.map(c => c.id);
      // When color is null from ColorPicker (transparent selection), save as empty string
      const colorToSave = color === null ? '' : color;
      // Update each column individually using dedicated route to ensure realtime events are emitted
      await Promise.all(
        columnIds.map(columnId =>
          api.request(`/columns/${columnId}`, {
            method: 'PATCH',
            body: JSON.stringify({ color: colorToSave }),
          })
        )
      );
      // Realtime handler will update state when events are received
      toast({ title: 'Success', description: 'Applied colour to all columns' });
    } catch (error: any) {
      console.error('Apply column color to all error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const onDragEnd = useCallback(async (result: DropResult) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!effectiveCanEdit || !user || !boardId) return;
    
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
      await api.rpc('batch_update_column_positions', {
        _user_id: user.id,
        _board_id: boardId,
        _updates: updates
      });
      return;
    }

    // Card drag
    const sourceCards = cards.filter(c => c.columnId === source.droppableId).sort((a, b) => a.position - b.position);
    const destCards = source.droppableId === destination.droppableId
      ? sourceCards
      : cards.filter(c => c.columnId === destination.droppableId).sort((a, b) => a.position - b.position);

    const draggedCard = cards.find(c => c.id === draggableId);
    if (!draggedCard) return;

    // Remove from source
    const newSourceCards = sourceCards.filter(c => c.id !== draggableId);
    
    // Add to destination
    const newDestCards = source.droppableId === destination.droppableId
      ? newSourceCards
      : [...destCards];
    
    const updatedCard = { ...draggedCard, columnId: destination.droppableId };
    newDestCards.splice(destination.index, 0, updatedCard);

    // Build update list
    const allUpdates: { id: string; columnId: string; position: number }[] = [];
    newSourceCards.forEach((c, idx) => allUpdates.push({ id: c.id, columnId: c.columnId, position: idx }));
    newDestCards.forEach((c, idx) => allUpdates.push({ id: c.id, columnId: destination.droppableId, position: idx }));
    
    // Deduplicate
    const uniqueUpdates = allUpdates.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

    // Update positions locally (optimistic) - like column reordering does
    // This prevents cards from visually reverting while waiting for realtime events
    const now = Date.now();
    setCards((prev) => {
      const updated = prev.map((c) => {
        const update = uniqueUpdates.find((u) => u.id === c.id);
        if (update) {
          // Get current card's updatedAt or use current time
          const currentUpdatedAt = c.updatedAt ? normalizeTimestamp(c.updatedAt) : now;
          // Use current time for optimistic update (will be replaced by server timestamp)
          const optimisticUpdatedAt = now;
          
          // Track pending optimistic update with normalized timestamp
          pendingCardUpdatesRef.current.set(c.id, {
            columnId: update.columnId,
            position: update.position,
            timestamp: now,
            updatedAt: optimisticUpdatedAt,
          });
          return { ...c, columnId: update.columnId, position: update.position };
        }
        return c;
      });
      // Sort cards by position within each column
      return updated.sort((a, b) => {
        if (a.columnId !== b.columnId) {
          return a.columnId.localeCompare(b.columnId);
        }
        return a.position - b.position;
      });
    });

    // Batch update in database (single server call)
    // Realtime events will sync final state, but optimistic update provides immediate feedback
    await api.rpc('batch_update_card_positions', {
      _user_id: user.id,
      _updates: uniqueUpdates
    });
  }, [columns, cards, effectiveCanEdit, user, boardId]);
  
  // Column reorder handler for mobile carousel dot drag
  const reorderColumns = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!effectiveCanEdit || !user || !boardId) return;
    if (fromIndex === toIndex) return;
    
    const newColumns = Array.from(columns);
    const [removed] = newColumns.splice(fromIndex, 1);
    newColumns.splice(toIndex, 0, removed);

    // Update positions locally (optimistic)
    const updatedColumns = newColumns.map((col, idx) => ({ ...col, position: idx }));
    setColumns(updatedColumns);

    // Batch update in database (single server call)
    const updates = updatedColumns.map(col => ({ id: col.id, position: col.position }));
    await api.rpc('batch_update_column_positions', {
      _user_id: user.id,
      _board_id: boardId,
      _updates: updates
    });
  }, [columns, effectiveCanEdit, user, boardId]);

  const addColumn = async () => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!boardId || !effectiveCanEdit) return;

    try {
      // Validate input
      const validated = columnSchema.parse({ title: newColumnTitle });

      const position = columns.length;
      // Use dedicated column route which emits realtime events
      const result = await api.request('/columns', {
        method: 'POST',
        body: JSON.stringify({ 
          boardId: boardId, 
          title: validated.title, 
          position 
        }),
      });

      if (result.error) throw result.error;
      if (!result.data) throw new Error('Failed to create column');
      // Realtime handler will update state when event is received
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
    if (!effectiveCanEdit) return;
    try {
      // Validate input
      const validated = columnSchema.parse({ title });
      
      // Use dedicated column route which emits realtime events
      const result = await api.request(`/columns/${columnId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: validated.title }),
      });
      if (result.error) throw result.error;
      // Realtime handler will update state when event is received
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
    if (!effectiveCanEdit) return;
    try {
      // Use dedicated column route which emits realtime events
      const result = await api.request(`/columns/${columnId}`, {
        method: 'DELETE',
      });
      if (result.error) throw result.error;
      // Realtime handler will update state when event is received
    } catch (error: any) {
      console.error('Delete column error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const addCard = async (columnId: string, title: string) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!effectiveCanEdit) return;
    try {
      // Validate input
      const validated = cardSchema.parse({ title });
      
      const columnCards = cards.filter(c => c.columnId === columnId);
      const position = columnCards.length;
      
      // Use dedicated card route which emits realtime events
      const result = await api.request('/cards', {
        method: 'POST',
        body: JSON.stringify({ 
          columnId: columnId, 
          title: validated.title, 
          position,
          createdBy: user?.id 
        }),
      });

      if (result.error) throw result.error;
      if (!result.data) throw new Error('Failed to create card');
      // Realtime handler will update state when event is received
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
    if (!effectiveCanEdit || !user) return;
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
          ...('dueDate' in updates && { dueDate: updates.dueDate || null }),
        };
      }));
      
      // Use server-side function for update (triggers realtime for all users)
      // Check if dueDate is explicitly null (meaning clear it) vs undefined (meaning don't update)
      const clearDueDate = 'dueDate' in updates && updates.dueDate === null;
      
      const { data, error } = await api.rpc('update_card', {
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
    if (!effectiveCanEdit) return;
    try {
      // Use dedicated card route which emits realtime events
      const result = await api.request(`/cards/${cardId}`, {
        method: 'DELETE',
      });
      if (result.error) throw result.error;
      // Realtime handler will update state when event is received
    } catch (error: any) {
      console.error('Delete card error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const addLabelToCard = async (cardId: string, label: Label) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!effectiveCanEdit || !boardId) return;
    try {
      // Check if label exists or create new one
      let labelId = label.id;
      const existingLabel = labels.find(l => l.id === label.id);
      
      if (!existingLabel) {
        const newLabelResult = await api
          .from('labels')
          .insert({ boardId: boardId, name: label.text, color: label.color });
        
        const newLabel = newLabelResult.data as any;
        const labelError = newLabelResult.error;

        if (labelError) throw labelError;
        if (Array.isArray(newLabel) && newLabel.length > 0) {
          labelId = newLabel[0].id;
          setLabels([...labels, newLabel[0] as DbLabel]);
        } else if (newLabel && typeof newLabel === 'object' && 'id' in newLabel) {
          labelId = newLabel.id;
          setLabels([...labels, newLabel as DbLabel]);
        }
      }

      // Add card-label relation
      const { error } = await api
        .from('card_labels')
        .insert({ cardId: cardId, labelId: labelId });

      if (error && !error.message?.includes('duplicate')) throw error;
      
      setCardLabels([...cardLabels, { cardId: cardId, labelId: labelId }]);
    } catch (error: any) {
      console.error('Add label error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const removeLabelFromCard = async (cardId: string, labelId: string) => {
    // Early return for better UX - RLS will reject if user lacks permission
    if (!effectiveCanEdit) return;
    try {
      const { error } = await api.from('card_labels').eq('cardId', cardId).eq('labelId', labelId).delete();
      if (error) throw error;
      setCardLabels(cardLabels.filter(cl => !(cl.cardId === cardId && cl.labelId === labelId)));
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

  // Access denied - show message and redirect
  if (accessDenied) {
    const handleRedirect = () => {
      if (user) {
        navigate('/');
      } else {
        navigate('/auth');
      }
    };

    // Auto-redirect after 3 seconds
    setTimeout(handleRedirect, 3000);

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <div className="mb-6 flex justify-center">
            <div className="p-4 rounded-full bg-destructive/10">
              <ShieldAlert className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don't have permission to view this board. You need to be a member to access it.
          </p>
          <Button onClick={handleRedirect}>
            {user ? 'Go to Boards' : 'Sign In'}
          </Button>
          <p className="text-sm text-muted-foreground mt-4">
            Redirecting automatically...
          </p>
        </div>
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
          backgroundColor: boardTheme?.navbarColor 
            ? sanitizeColor(boardTheme.navbarColor) 
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
              {appSettings?.customBoardLogoEnabled && appSettings?.customBoardLogoUrl ? (
                <img
                  src={appSettings.customBoardLogoUrl}
                  alt="Logo"
                  style={{ width: appSettings.customBoardLogoSize, height: appSettings.customBoardLogoSize }}
                  className="object-contain shrink-0"
                />
              ) : (
                <LayoutGrid 
                  className="h-5 w-5 shrink-0 hidden sm:block" 
                  style={{ color: boardTheme?.boardIconColor || 'white' }}
                />
              )}
              <h1 className="text-base md:text-xl font-bold text-white truncate">{boardName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            {/* Desktop: Show all actions */}
            {isDesktop && (
              <>
                {boardId && effectiveCanEdit && (
                  <InviteLinkButton boardId={boardId} canGenerateInvite={effectiveCanEdit} />
                )}
                {effectiveCanManage && (
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
                {effectiveCanManage && (
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
                    {boardId && effectiveCanEdit && (
                      <InviteLinkButton boardId={boardId} canGenerateInvite={effectiveCanEdit} />
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
              disabled={!effectiveCanEdit}
              themeColumnColor={boardTheme?.columnColor}
              themeCardColor={boardTheme?.defaultCardColor}
              themeScrollbarColor={boardTheme?.scrollbarColor}
              themeScrollbarTrackColor={boardTheme?.scrollbarTrackColor}
            />
            {/* Mobile Add Column FAB */}
            {effectiveCanEdit && (
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
              ? `${boardTheme.scrollbarColor} ${boardTheme.scrollbarTrackColor}` 
              : undefined,
          }}
        >
          <style>{boardTheme ? `
            .board-scroll-area::-webkit-scrollbar { width: 8px; height: 8px; }
            .board-scroll-area::-webkit-scrollbar-track { background: ${boardTheme.scrollbarTrackColor}; }
            .board-scroll-area::-webkit-scrollbar-thumb { background: ${boardTheme.scrollbarColor}; border-radius: 4px; }
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
                      disabled={!effectiveCanEdit}
                      themeColumnColor={boardTheme?.columnColor}
                      themeCardColor={boardTheme?.defaultCardColor}
                      themeScrollbarColor={boardTheme?.scrollbarColor}
                      themeScrollbarTrackColor={boardTheme?.scrollbarTrackColor}
                    />
                  ))}
                  {provided.placeholder}

                  {/* Add Column */}
                  {effectiveCanEdit && (
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
        disabled={!effectiveCanEdit}
        boardLabels={labels.map(l => ({
          id: l.id,
          board_id: l.boardId,
          name: l.name,
          color: l.color,
        }))}
        attachments={editingCard ? cardAttachments.filter(a => a.cardId === editingCard.card.id).map(a => ({
          id: a.id,
          card_id: a.cardId,
          file_name: a.fileName,
          file_url: a.fileUrl,
          file_size: a.fileSize,
          file_type: a.fileType,
          uploaded_by: a.uploadedBy,
          created_at: a.createdAt,
        })) : []}
        onAttachmentsChange={async () => {
          if (editingCard) {
            const attachmentsResult = await api
              .from('card_attachments')
              .select('*')
              .eq('cardId', editingCard.card.id);
            const attachments = (attachmentsResult.data || []) as typeof cardAttachments;
            setCardAttachments(prev => [
              ...prev.filter(a => a.cardId !== editingCard.card.id),
              ...attachments
            ]);
          }
        }}
        subtasks={editingCard ? cardSubtasks.filter(s => s.cardId === editingCard.card.id).map(s => ({
          id: s.id,
          card_id: s.cardId,
          title: s.title,
          completed: s.completed,
          completed_at: s.completedAt,
          completed_by: s.completedBy,
          position: s.position,
          checklist_name: s.checklistName,
          created_at: s.createdAt,
        })) : []}
        onSubtasksChange={async () => {
          if (editingCard) {
            const subtasksResult = await api
              .from('card_subtasks')
              .select('*')
              .eq('cardId', editingCard.card.id);
            const subtasks = (subtasksResult.data || []) as typeof cardSubtasks;
            setCardSubtasks(prev => [
              ...prev.filter(s => s.cardId !== editingCard.card.id),
              ...subtasks
            ]);
          }
        }}
        themeCardWindowColor={boardTheme?.cardWindowColor}
        themeCardWindowTextColor={boardTheme?.cardWindowTextColor}
        themeCardWindowButtonColor={boardTheme?.cardWindowButtonColor}
        themeCardWindowButtonTextColor={boardTheme?.cardWindowButtonTextColor}
        themeCardWindowButtonHoverColor={boardTheme?.cardWindowButtonHoverColor}
        themeCardWindowButtonHoverTextColor={boardTheme?.cardWindowButtonHoverTextColor}
        themeCardWindowIntelligentContrast={boardTheme?.cardWindowIntelligentContrast}
      />

      {/* Board Settings Modal */}
      {boardId && (
        <BoardSettingsModal
          open={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          boardId={boardId}
          workspaceId={workspaceId}
          members={boardMembers}
          userRole={userRole}
          currentUserId={user?.id || null}
          boardCreatedBy={boardCreatedBy}
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
