import { useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Column, Card } from '@/types/kanban';
import { KanbanCard } from './KanbanCard';
import { MoreHorizontal, Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  column: Column;
  index: number;
  onUpdateTitle: (title: string) => void;
  onDelete: () => void;
  onAddCard: (title: string) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (cardId: string) => void;
  disabled?: boolean;
}

export function KanbanColumn({
  column,
  index,
  onUpdateTitle,
  onDelete,
  onAddCard,
  onEditCard,
  onDeleteCard,
  disabled = false,
}: KanbanColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(column.title);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');

  const handleSaveTitle = () => {
    if (editedTitle.trim()) {
      onUpdateTitle(editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleAddCard = () => {
    if (newCardTitle.trim()) {
      onAddCard(newCardTitle.trim());
      setNewCardTitle('');
      setIsAddingCard(false);
    }
  };

  return (
    <Draggable draggableId={column.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="w-72 shrink-0"
        >
          <div className="bg-column rounded-xl p-3">
            {/* Header */}
            <div
              {...provided.dragHandleProps}
              className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing"
            >
              {isEditingTitle ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="h-7 text-sm font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveTitle}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setIsEditingTitle(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-column-header text-sm">{column.title}</h3>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {column.cards.length}
                    </span>
                  </div>
                  {!disabled && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onDelete} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
            </div>

            {/* Cards */}
            <Droppable droppableId={column.id} type="card">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'min-h-[2rem] transition-colors duration-200 rounded-lg',
                    snapshot.isDraggingOver && 'bg-primary/5'
                  )}
                >
                  {column.cards.map((card, cardIndex) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      index={cardIndex}
                      columnId={column.id}
                      onEdit={() => onEditCard(card)}
                      onDelete={() => onDeleteCard(card.id)}
                      disabled={disabled}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>

            {/* Add Card */}
            {!disabled && (
              isAddingCard ? (
                <div className="mt-2 animate-fade-in">
                  <Input
                    value={newCardTitle}
                    onChange={(e) => setNewCardTitle(e.target.value)}
                    placeholder="Enter card title..."
                    className="mb-2"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCard();
                      if (e.key === 'Escape') {
                        setIsAddingCard(false);
                        setNewCardTitle('');
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleAddCard}>
                      Add Card
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsAddingCard(false);
                        setNewCardTitle('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 justify-start text-muted-foreground hover:text-foreground"
                  onClick={() => setIsAddingCard(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add a card
                </Button>
              )
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
