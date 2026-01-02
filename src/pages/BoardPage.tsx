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
import { subscribeBoardCards, subscribeBoardColumns, subscribeBoardMembers } from '@/realtime/boardSubscriptions';
interface DbColumn {
  id: string;
  boardId: string;
  title: string;
  position: number;
  color: string | null;
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

      const transformedMembers: BoardMember[] = (data || []).map((m: any) => ({
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

  // Unified realtime subscriptions for cards, columns, and board members
  useEffect(() => {
    if (!boardId) return;

    const cleanups: Array<() => void> = [];

    cleanups.push(
      subscribeBoardCards(boardId, {
        onInsert: (newCard) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:191',message:'card INSERT handler called',data:{cardId:(newCard as any)?.id,columnId:(newCard as any)?.columnId,hasColumnInRef:columnIdsRef.current.includes((newCard as any)?.columnId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          const card = newCard as DbCard;
          // Verify the card belongs to a column in this board
          // If columnIdsRef is empty, we're still loading, so accept all cards
          // If columnIdsRef has values, check if the column exists (it might be a newly created column)
          // Always add the card - if the column doesn't exist, it will be filtered by the column component
          console.log('[BoardPage] Card INSERT event received:', {
            cardId: card.id,
            columnId: card.columnId,
            hasColumnInRef: columnIdsRef.current.includes(card.columnId),
            columnIdsRefLength: columnIdsRef.current.length,
          });
          setCards((prev) => {
            if (prev.some((c) => c.id === card.id)) {
              console.log('[BoardPage] Card already in state, skipping insert');
              return prev;
            }
            console.log('[BoardPage] Adding new card to state:', card.id);
            return [...prev, card];
          });
        },
        onUpdate: (updatedCardRaw, previousRaw) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:200',message:'card UPDATE handler called',data:{cardId:(updatedCardRaw as any)?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          const updatedCard = updatedCardRaw as DbCard;
          const previous = previousRaw as DbCard;
          setCards((prev) => {
            const existingCard = prev.find((c) => c.id === updatedCard.id);
            if (!existingCard) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:204',message:'card UPDATE - card not found in state',data:{cardId:updatedCard.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              return prev;
            }

            const hasChange =
              existingCard.title !== updatedCard.title ||
              existingCard.description !== updatedCard.description ||
              existingCard.dueDate !== updatedCard.dueDate ||
              existingCard.position !== updatedCard.position ||
              existingCard.columnId !== updatedCard.columnId ||
              existingCard.color !== updatedCard.color;

            if (!hasChange) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:215',message:'card UPDATE - no change detected',data:{cardId:updatedCard.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              return prev;
            }

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:217',message:'setCards called for UPDATE',data:{cardId:updatedCard.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            return prev.map((c) => (c.id === updatedCard.id ? updatedCard : c));
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

          // Handle card moves between columns
          // The card has already been updated with the new columnId above
          // If the new column doesn't exist in our state yet, the card will appear when the column is loaded
          // We don't filter out cards here - let the column state determine visibility
        },
        onDelete: (deletedCardRaw) => {
          const deletedCard = deletedCardRaw as DbCard;
          setCards((prev) => prev.filter((c) => c.id !== deletedCard.id));
          setEditingCard((prev) => {
            if (prev && prev.card.id === deletedCard.id) {
              return null;
            }
            return prev;
          });
        },
      })
    );

    cleanups.push(
      subscribeBoardColumns(boardId, {
        onInsert: (newColumnRaw) => {
          console.log('[BoardPage] Column INSERT event received:', newColumnRaw);
          const newColumn = newColumnRaw as DbColumn;
          // Verify the column belongs to this board
          if (newColumn.boardId !== boardId) {
            console.warn('[BoardPage] Column INSERT event for different board, ignoring:', {
              columnBoardId: newColumn.boardId,
              currentBoardId: boardId,
            });
            return;
          }
          setColumns((prev) => {
            if (prev.some((c) => c.id === newColumn.id)) {
              console.log('[BoardPage] Column already in state, skipping insert');
              return prev;
            }
            console.log('[BoardPage] Adding new column to state:', newColumn.id);
            // Sort by position after adding
            const updated = [...prev, newColumn];
            return updated.sort((a, b) => a.position - b.position);
          });
        },
        onUpdate: (updatedColumnRaw, previousRaw) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:265',message:'column UPDATE handler called',data:{columnId:(updatedColumnRaw as any)?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          const updatedColumn = updatedColumnRaw as DbColumn;
          setColumns((prev) => {
            const existingColumn = prev.find((c) => c.id === updatedColumn.id);
            if (!existingColumn) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:268',message:'column UPDATE - column not found in state',data:{columnId:updatedColumn.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              return prev;
            }

            if (
              existingColumn.title === updatedColumn.title &&
              existingColumn.position === updatedColumn.position &&
              existingColumn.color === updatedColumn.color
            ) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:275',message:'column UPDATE - no change detected',data:{columnId:updatedColumn.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              return prev;
            }
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:277',message:'setColumns called for UPDATE',data:{columnId:updatedColumn.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            // Update the column and re-sort by position to ensure correct order after reorder operations
            const updated = prev.map((c) => (c.id === updatedColumn.id ? updatedColumn : c));
            return updated.sort((a, b) => a.position - b.position);
          });
        },
        onDelete: (deletedColumnRaw) => {
          console.log('[BoardPage] Column DELETE event received:', deletedColumnRaw);
          const deletedColumn = deletedColumnRaw as DbColumn;
          // Verify the column belongs to this board
          if (deletedColumn.boardId !== boardId) {
            console.warn('[BoardPage] Column DELETE event for different board, ignoring:', {
              columnBoardId: deletedColumn.boardId,
              currentBoardId: boardId,
            });
            return;
          }
          setColumns((prev) => prev.filter((c) => c.id !== deletedColumn.id));
          setCards((prev) => prev.filter((c) => c.columnId !== deletedColumn.id));
        },
      })
    );

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:289',message:'checking board members subscription condition',data:{hasUser:!!user,boardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    // Subscribe to board members if user exists (preview mode should not block realtime subscriptions)
    if (user) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:290',message:'calling subscribeBoardMembers',data:{boardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      cleanups.push(
        subscribeBoardMembers(boardId, {
          onInsert: (membershipRaw) => {
            console.log('[BoardPage] Member INSERT event received:', {
              eventType: 'INSERT',
              payload: membershipRaw,
              hasUser: !!(membershipRaw as any).user,
              hasProfile: !!(membershipRaw as any).user?.profile,
              userId: (membershipRaw as any).userId,
              role: (membershipRaw as any).role,
            });
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:289',message:'handler onInsert called',data:{hasPayload:!!membershipRaw,userId:(membershipRaw as any)?.userId,role:(membershipRaw as any)?.role,hasUser:!!(membershipRaw as any)?.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            const newMembership = membershipRaw as { userId?: string; role?: string; user?: { profile?: { fullName?: string | null; email?: string } } };
            
            // Always refresh members list when a new member is added (even if payload is incomplete)
            // This ensures UI is always in sync with backend
            refreshBoardMembers();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BoardPage.tsx:302',message:'refreshBoardMembers called',data:{boardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // Only show toast if it's not the current user (they already see their own action)
            if (newMembership.userId && newMembership.userId !== user.id) {
              const memberName = newMembership.user?.profile?.fullName || 
                                newMembership.user?.profile?.email || 
                                'a member';
              const role = newMembership.role || 'viewer';
              toast({
                title: 'Member added',
                description: `${memberName} added as ${role}`,
              });
            }
          },
          onUpdate: (membershipRaw, previousRaw) => {
            console.log('[BoardPage] Member UPDATE event received:', {
              eventType: 'UPDATE',
              payload: membershipRaw,
              previous: previousRaw,
              hasUser: !!(membershipRaw as any).user,
              hasProfile: !!(membershipRaw as any).user?.profile,
              userId: (membershipRaw as any).userId,
              role: (membershipRaw as any).role,
            });
            const updatedMembership = membershipRaw as { userId?: string; role?: string; user?: { profile?: { fullName?: string | null; email?: string } } };
            const previousMembership = previousRaw as { role?: string };
            
            // Always refresh members list (even if payload is incomplete)
            refreshBoardMembers();
            
            if (updatedMembership?.userId === user.id && updatedMembership.role) {
              setUserRole(updatedMembership.role as 'admin' | 'manager' | 'viewer');
            } else if (updatedMembership.userId && updatedMembership.userId !== user.id) {
              // Show toast for other users' role changes
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
          },
          onDelete: (membershipRaw) => {
            console.log('[BoardPage] Member DELETE event received:', {
              eventType: 'DELETE',
              payload: membershipRaw,
              hasUser: !!(membershipRaw as any).user,
              hasProfile: !!(membershipRaw as any).user?.profile,
              userId: (membershipRaw as any).userId,
            });
            const deletedMember = membershipRaw as { userId?: string; user?: { profile?: { fullName?: string | null; email?: string } } };
            
            if (deletedMember?.userId === user.id) {
              toast({
                title: 'Access removed',
                description: 'You have been removed from this board.',
                variant: 'destructive',
              });
              navigate('/', {
                state: {
                  removedFromBoard: {
                    boardId: boardId,
                    workspaceId: workspaceId,
                    timestamp: Date.now(),
                  },
                },
              });
            } else {
              // Always refresh members list (even if payload is incomplete)
              refreshBoardMembers();
              
              // Show toast for other users being removed
              if (deletedMember.userId) {
                const memberName = deletedMember.user?.profile?.fullName || 
                                  deletedMember.user?.profile?.email || 
                                  'a member';
                toast({
                  title: 'Member removed',
                  description: `${memberName} removed from board`,
                });
              }
            }
          },
        })
      );
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [boardId, user, refreshBoardMembers, navigate, workspaceId, toast]);

  const fetchBoardData = async () => {
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

      // Fetch themeId and theme data separately (not in RPC response)
      const { data: boardData } = await api
        .from('boards')
        .select('themeId')
        .eq('id', boardId)
        .single();
      
      const themeId = boardData?.data?.themeId || null;
      setBoardThemeId(themeId);
      
      // Fetch full theme data if theme is set
      if (themeId) {
        const { data: themeData } = await api
          .from('board_themes')
          .select('*')
          .eq('id', themeId)
          .single();
        setBoardTheme(themeData?.data as BoardTheme | null);
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
        setCardAttachments(attachmentsResult.data || []);
        setCardSubtasks(subtasksResult.data || []);
      }
      
      // Transform members to expected format
      const transformedMembers: BoardMember[] = (result.members || []).map((m) => ({
        userId: m.userId,
        role: m.role as 'admin' | 'manager' | 'viewer',
        profiles: {
          id: m.profiles.id,
          email: m.profiles.email || '',
          fullName: m.profiles.fullName,
          avatarUrl: m.profiles.avatarUrl,
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


  // Lightweight theme refresh - updates theme without triggering loading state
  const refreshBoardTheme = async () => {
    if (!boardId) return;
    try {
      const { data: boardData } = await api
        .from('boards')
        .select('themeId, backgroundColor')
        .eq('id', boardId)
        .single();
      
      const themeId = boardData?.data?.themeId || null;
      setBoardThemeId(themeId);
      setBoardColor(boardData?.data?.backgroundColor || '#0079bf');
      
      if (themeId) {
        const { data: themeData } = await api
          .from('board_themes')
          .select('*')
          .eq('id', themeId)
          .single();
        setBoardTheme(themeData?.data as BoardTheme | null);
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

    // Don't update local state optimistically - rely on realtime events
    // This prevents cards from reverting if there's a race condition
    // The realtime handler will update state when events are received

    // Batch update in database (single server call)
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
      const { data, error } = await api
        .from('columns')
        .insert({ boardId: boardId, title: validated.title, position });

      if (error) throw error;
      if (!data) throw new Error('Failed to create column');
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
      const { error } = await api.from('columns').eq('id', columnId).delete();
      if (error) throw error;
      setColumns(columns.filter(c => c.id !== columnId));
      setCards(cards.filter(c => c.columnId !== columnId));
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
      
      const { data, error } = await api
        .from('cards')
        .insert({ columnId: columnId, title: validated.title, position, createdBy: user?.id });

      if (error) throw error;
      if (!data) throw new Error('Failed to create card');
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
      const { error } = await api.from('cards').eq('id', cardId).delete();
      if (error) throw error;
      setCards(cards.filter(c => c.id !== cardId));
      setCardLabels(cardLabels.filter(cl => cl.cardId !== cardId));
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
        const { data: newLabel, error: labelError } = await api
          .from('labels')
          .insert({ boardId: boardId, name: label.text, color: label.color })
          .select()
          .single();

        if (labelError) throw labelError;
        labelId = newLabel.data?.id || newLabel.id;
        setLabels([...labels, newLabel.data || newLabel]);
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
              themeColumnColor={boardTheme?.column_color}
              themeCardColor={boardTheme?.default_card_color}
              themeScrollbarColor={boardTheme?.scrollbar_color}
              themeScrollbarTrackColor={boardTheme?.scrollbar_track_color}
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
                      disabled={!effectiveCanEdit}
                      themeColumnColor={boardTheme?.column_color}
                      themeCardColor={boardTheme?.default_card_color}
                      themeScrollbarColor={boardTheme?.scrollbar_color}
                      themeScrollbarTrackColor={boardTheme?.scrollbar_track_color}
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
        boardLabels={labels}
        attachments={editingCard ? cardAttachments.filter(a => a.cardId === editingCard.card.id) : []}
        onAttachmentsChange={async () => {
          if (editingCard) {
            const { data } = await api
              .from('card_attachments')
              .select('*')
              .eq('cardId', editingCard.card.id);
            setCardAttachments(prev => [
              ...prev.filter(a => a.cardId !== editingCard.card.id),
              ...(data || [])
            ]);
          }
        }}
        subtasks={editingCard ? cardSubtasks.filter(s => s.cardId === editingCard.card.id) : []}
        onSubtasksChange={async () => {
          if (editingCard) {
            const { data } = await api
              .from('card_subtasks')
              .select('*')
              .eq('cardId', editingCard.card.id);
            setCardSubtasks(prev => [
              ...prev.filter(s => s.cardId !== editingCard.card.id),
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
