import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Card, Label } from '@/types/kanban';
import { Calendar, MoreHorizontal, Trash2 } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface KanbanCardProps {
  card: Card;
  index: number;
  columnId: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

const labelColorClasses: Record<Label['color'], string> = {
  red: 'bg-label-red',
  orange: 'bg-label-orange',
  yellow: 'bg-label-yellow',
  green: 'bg-label-green',
  blue: 'bg-label-blue',
  purple: 'bg-label-purple',
  pink: 'bg-label-pink',
};

export const KanbanCard = memo(function KanbanCard({ card, index, columnId, onEdit, onDelete, disabled = false }: KanbanCardProps) {
  const dueDate = card.dueDate ? new Date(card.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && isToday(dueDate);

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't open card if clicking on dropdown menu
    const target = e.target as HTMLElement;
    if (target.closest('[data-dropdown-menu]') || target.closest('button')) {
      return;
    }
    onEdit();
  };

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={handleCardClick}
          className={cn(
            'kanban-card group bg-card rounded-lg p-3 mb-2 cursor-pointer transition-all duration-200',
            snapshot.isDragging
              ? 'shadow-card-dragging rotate-2 scale-105 cursor-grabbing'
              : 'shadow-card hover:shadow-card-hover hover:bg-card/80'
          )}
        >
          {/* Labels */}
          {card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {card.labels.map((label) => (
                <span
                  key={label.id}
                  className={cn(
                    'h-2 rounded-full transition-all duration-200',
                    labelColorClasses[label.color],
                    label.text ? 'px-2 py-0.5 h-auto text-[10px] font-medium text-white' : 'w-10'
                  )}
                >
                  {label.text}
                </span>
              ))}
            </div>
          )}

          {/* Title & Menu */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-card-foreground leading-snug flex-1">
              {card.title}
            </h4>
            {!disabled && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-dropdown-menu
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Description preview */}
          {card.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {card.description.replace(/<[^>]*>/g, '').split('\n')[0]}
            </p>
          )}

          {/* Due date */}
          {dueDate && (
            <div
              className={cn(
                'flex items-center gap-1 mt-2 text-xs font-medium rounded px-1.5 py-0.5 w-fit',
                isOverdue && 'bg-destructive/10 text-destructive',
                isDueToday && 'bg-label-orange/10 text-label-orange',
                !isOverdue && !isDueToday && 'bg-muted text-muted-foreground'
              )}
            >
              <Calendar className="h-3 w-3" />
              {format(dueDate, 'MMM d')}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
});
