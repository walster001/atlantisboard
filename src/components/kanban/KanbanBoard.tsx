import { useState } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { useKanbanBoard } from '@/hooks/useKanbanBoard';
import { KanbanColumn } from './KanbanColumn';
import { CardEditDialog } from './CardEditDialog';
import { Card } from '@/types/kanban';
import { Plus, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function KanbanBoard() {
  const {
    board,
    onDragEnd,
    addColumn,
    updateColumn,
    deleteColumn,
    addCard,
    updateCard,
    deleteCard,
    addLabel,
    removeLabel,
  } = useKanbanBoard();

  const [editingCard, setEditingCard] = useState<{ card: Card; columnId: string } | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

  const handleAddColumn = () => {
    if (newColumnTitle.trim()) {
      addColumn(newColumnTitle.trim());
      setNewColumnTitle('');
      setIsAddingColumn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <LayoutGrid className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{board.title}</h1>
              <p className="text-sm text-muted-foreground">
                {board.columns.length} columns · {board.columns.reduce((acc, col) => acc + col.cards.length, 0)} cards
              </p>
            </div>
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
                {board.columns.map((column, index) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    index={index}
                    onUpdateTitle={(title) => updateColumn(column.id, title)}
                    onDelete={() => deleteColumn(column.id)}
                    onAddCard={(title) => addCard(column.id, title)}
                    onEditCard={(card) => setEditingCard({ card, columnId: column.id })}
                    onDeleteCard={(cardId) => deleteCard(column.id, cardId)}
                  />
                ))}
                {provided.placeholder}

                {/* Add Column */}
                <div className="w-72 shrink-0">
                  {isAddingColumn ? (
                    <div className="bg-column rounded-xl p-3 animate-scale-in">
                      <Input
                        value={newColumnTitle}
                        onChange={(e) => setNewColumnTitle(e.target.value)}
                        placeholder="Enter list title..."
                        className="mb-2"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddColumn();
                          if (e.key === 'Escape') {
                            setIsAddingColumn(false);
                            setNewColumnTitle('');
                          }
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleAddColumn}>
                          Add List
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setIsAddingColumn(false);
                            setNewColumnTitle('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      className="w-full justify-start bg-column/50 hover:bg-column text-muted-foreground hover:text-foreground rounded-xl h-12"
                      onClick={() => setIsAddingColumn(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add another list
                    </Button>
                  )}
                </div>
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
            updateCard(editingCard.columnId, editingCard.card.id, updates);
          }
        }}
        onAddLabel={(label) => {
          if (editingCard) {
            addLabel(editingCard.columnId, editingCard.card.id, label);
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
            removeLabel(editingCard.columnId, editingCard.card.id, labelId);
            setEditingCard({
              ...editingCard,
              card: {
                ...editingCard.card,
                labels: editingCard.card.labels.filter((l) => l.id !== labelId),
              },
            });
          }
        }}
      />
    </div>
  );
}
