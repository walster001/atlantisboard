import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { CardDetailModal } from '@/components/kanban/CardDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, ArrowLeft, Loader2, Users, LayoutGrid, LogOut, User, Settings } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card as CardType, Label, LabelColor } from '@/types/kanban';
import { BoardMembersDialog } from '@/components/kanban/BoardMembersDialog';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { columnSchema, cardSchema, sanitizeColor } from '@/lib/validators';
import { useDragScroll } from '@/hooks/useDragScroll';
import { z } from 'zod';

interface DbColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
}

interface DbCard {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  created_by: string | null;
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
  const { toast } = useToast();

  const [boardName, setBoardName] = useState('');
  const [boardColor, setBoardColor] = useState('#0079bf');
  const [columns, setColumns] = useState<DbColumn[]>([]);
  const [cards, setCards] = useState<DbCard[]>([]);
  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [cardLabels, setCardLabels] = useState<DbCardLabel[]>([]);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'viewer' | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingCard, setEditingCard] = useState<{ card: CardType; columnId: string } | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const { ref: dragScrollRef, isDragging, isSpaceHeld } = useDragScroll<HTMLDivElement>();

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

  // Realtime subscription for cards - updates UI instantly without refresh
  useEffect(() => {
    if (!boardId || !columns.length) return;

    const columnIds = columns.map(c => c.id);
    
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
          if (columnIds.includes(newCard.column_id)) {
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
          // Only process if card belongs to this board
          if (columnIds.includes(updatedCard.column_id)) {
            setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));
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
                  }
                };
              }
              return prev;
            });
          }
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
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, columns]);

  const fetchBoardData = async () => {
    if (!boardId || !user) return;
    setLoading(true);

    try {
      // Single server-side call to get all board data
      const { data, error } = await supabase.rpc('get_board_data', {
        _board_id: boardId,
        _user_id: user.id
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
      setUserRole(result.user_role as 'admin' | 'manager' | 'viewer' | null);
      setColumns(result.columns || []);
      setCards(result.cards || []);
      setLabels(result.labels || []);
      setCardLabels(result.card_labels || []);
      
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

  // UI-only permission checks for better UX
  // SECURITY NOTE: These do NOT provide security - all permissions
  // are enforced server-side via RLS policies. These checks only
  // hide UI elements to improve user experience.
  // App admins have full access to all boards
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
              color: label.color as LabelColor, 
              text: label.name || undefined 
            } as Label;
          })
          .filter((l): l is Label => l !== null),
        dueDate: c.due_date || undefined,
        createdAt: '',
      }));
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
      
      // Use server-side function for update (triggers realtime for all users)
      const { data, error } = await supabase.rpc('update_card', {
        _user_id: user.id,
        _card_id: cardId,
        _title: updates.title || null,
        _description: updates.description || null,
        _due_date: updates.dueDate || null,
        _clear_due_date: updates.dueDate === undefined ? false : !updates.dueDate
      });

      if (error) throw error;
      
      const result = data as { error?: string; success?: boolean; card?: DbCard };
      if (result?.error) {
        throw new Error(result.error);
      }

      // Optimistic update (realtime will sync other users)
      if (result?.card) {
        setCards(cards.map(c => c.id === cardId ? result.card! : c));
      }
    } catch (error: any) {
      console.error('Update card error:', error);
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

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: sanitizeColor(boardColor) }}>
      {/* Header */}
      <header className="flex-shrink-0 z-10 bg-black/20 backdrop-blur-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-white hover:bg-white/20">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-white" />
              <h1 className="text-xl font-bold text-white">{boardName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManageMembers && (
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                onClick={() => setMembersDialogOpen(true)}
              >
                <Users className="h-4 w-4 mr-2" />
                Members
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
          </div>
        </div>
      </header>

      {/* Board */}
      <div 
        ref={dragScrollRef} 
        className={`flex-1 min-h-0 overflow-x-auto overflow-y-auto scrollbar-thin ${
          isDragging ? 'cursor-grabbing' : isSpaceHeld ? 'cursor-grab' : 'cursor-default'
        }`}
      >
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="board" type="column" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="drag-scroll-area flex items-start gap-4 p-6 min-h-full min-w-max"
              >
                {columns.map((column, index) => (
                  <KanbanColumn
                    key={column.id}
                    column={{
                      id: column.id,
                      title: column.title,
                      cards: getColumnCards(column.id),
                    }}
                    index={index}
                    onUpdateTitle={(title) => updateColumnTitle(column.id, title)}
                    onDelete={() => deleteColumn(column.id)}
                    onAddCard={(title) => addCard(column.id, title)}
                    onEditCard={(card) => setEditingCard({ card, columnId: column.id })}
                    onDeleteCard={(cardId) => deleteCard(cardId)}
                    disabled={!canEdit}
                  />
                ))}
                {provided.placeholder}

                {/* Add Column */}
                {canEdit && (
                  <div className="w-72 shrink-0">
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
      />

      {/* Members Dialog */}
      {boardId && (
        <BoardMembersDialog
          open={membersDialogOpen}
          onClose={() => setMembersDialogOpen(false)}
          boardId={boardId}
          members={boardMembers}
          userRole={userRole}
          onMembersChange={fetchBoardData}
        />
      )}
    </div>
  );
}
