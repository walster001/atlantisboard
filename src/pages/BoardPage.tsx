import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { CardEditDialog } from '@/components/kanban/CardEditDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, ArrowLeft, Loader2, Users, LayoutGrid } from 'lucide-react';
import { Card as CardType, Label, LabelColor } from '@/types/kanban';
import { BoardMembersDialog } from '@/components/kanban/BoardMembersDialog';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { columnSchema, cardSchema } from '@/lib/validators';
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
  const { user, loading: authLoading, isAppAdmin } = useAuth();
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

  const fetchBoardData = async () => {
    if (!boardId) return;
    setLoading(true);

    try {
      // Fetch board details
      const { data: board, error: boardError } = await supabase
        .from('boards')
        .select('*')
        .eq('id', boardId)
        .maybeSingle();

      if (boardError) throw boardError;
      if (!board) {
        toast({ title: 'Board not found', variant: 'destructive' });
        navigate('/');
        return;
      }

      setBoardName(board.name);
      setBoardColor(board.background_color || '#0079bf');

      // Fetch user's role on this board
      const { data: memberData } = await supabase
        .from('board_members')
        .select('role')
        .eq('board_id', boardId)
        .eq('user_id', user?.id)
        .maybeSingle();

      setUserRole(memberData?.role as 'admin' | 'manager' | 'viewer' | null);

      // Fetch columns
      const { data: columnsData, error: colError } = await supabase
        .from('columns')
        .select('*')
        .eq('board_id', boardId)
        .order('position');

      if (colError) throw colError;
      setColumns(columnsData || []);

      // Fetch cards
      const { data: cardsData, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .in('column_id', columnsData?.map(c => c.id) || [])
        .order('position');

      if (cardsError) throw cardsError;
      setCards(cardsData || []);

      // Fetch labels
      const { data: labelsData, error: labelsError } = await supabase
        .from('labels')
        .select('*')
        .eq('board_id', boardId);

      if (labelsError) throw labelsError;
      setLabels(labelsData || []);

      // Fetch card labels
      if (cardsData && cardsData.length > 0) {
        const { data: cardLabelsData, error: clError } = await supabase
          .from('card_labels')
          .select('*')
          .in('card_id', cardsData.map(c => c.id));

        if (clError) throw clError;
        setCardLabels(cardLabelsData || []);
      }

      // Fetch board members using secure function (masks email for non-admins)
      const { data: membersData, error: membersError } = await supabase
        .rpc('get_board_member_profiles', { _board_id: boardId });

      if (membersError) throw membersError;
      
      // Transform RPC result to BoardMember format
      const transformedMembers: BoardMember[] = (membersData || []).map((m: any) => ({
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
    if (!canEdit) return;
    
    const { destination, source, type, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'column') {
      const newColumns = Array.from(columns);
      const [removed] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, removed);

      // Update positions locally
      const updatedColumns = newColumns.map((col, idx) => ({ ...col, position: idx }));
      setColumns(updatedColumns);

      // Update in database
      for (const col of updatedColumns) {
        await supabase.from('columns').update({ position: col.position }).eq('id', col.id);
      }
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

    // Update positions
    const allUpdates: DbCard[] = [];
    newSourceCards.forEach((c, idx) => allUpdates.push({ ...c, position: idx }));
    if (source.droppableId !== destination.droppableId) {
      newDestCards.forEach((c, idx) => allUpdates.push({ ...c, position: idx }));
    } else {
      newDestCards.forEach((c, idx) => allUpdates.push({ ...c, position: idx }));
    }

    // Update local state
    setCards(prev => {
      const others = prev.filter(c => 
        c.column_id !== source.droppableId && c.column_id !== destination.droppableId
      );
      return [...others, ...allUpdates.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)];
    });

    // Update in database
    await supabase.from('cards').update({ column_id: destination.droppableId, position: destination.index }).eq('id', draggableId);
    
    // Update positions for other cards
    for (const card of allUpdates) {
      if (card.id !== draggableId) {
        await supabase.from('cards').update({ position: card.position }).eq('id', card.id);
      }
    }
  }, [columns, cards, canEdit]);

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
    if (!canEdit) return;
    try {
      // Validate input if title or description provided
      if (updates.title !== undefined || updates.description !== undefined) {
        cardSchema.partial().parse({
          title: updates.title,
          description: updates.description,
        });
      }
      
      const dbUpdates: any = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate || null;

      await supabase.from('cards').update(dbUpdates).eq('id', cardId);
      setCards(cards.map(c => c.id === cardId ? { ...c, ...dbUpdates } : c));
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
    <div className="min-h-screen" style={{ backgroundColor: boardColor }}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-black/20 backdrop-blur-sm">
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
                Members ({boardMembers.length})
              </Button>
            )}
            {isAppAdmin && (
              <span className="text-xs text-white bg-primary px-2 py-1 rounded font-medium">
                App Admin
              </span>
            )}
            {userRole && !isAppAdmin && (
              <span className="text-xs text-white/70 bg-white/20 px-2 py-1 rounded">
                {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Board */}
      <div className="p-6 overflow-x-auto scrollbar-thin">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="board" type="column" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex items-start gap-4"
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

      {/* Card Edit Dialog */}
      <CardEditDialog
        card={editingCard?.card || null}
        open={!!editingCard}
        onClose={() => setEditingCard(null)}
        onSave={(updates) => {
          if (editingCard) {
            updateCard(editingCard.card.id, updates);
            setEditingCard(null);
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
