import { Draggable } from '@hello-pangea/dnd';
import { Card, Label } from '@/types/kanban';
import { Calendar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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

export function KanbanCard({ card, index, columnId, onEdit, onDelete }: KanbanCardProps) {
  const dueDate = card.dueDate ? new Date(card.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && isToday(dueDate);

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            'group bg-card rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing transition-all duration-200',
            snapshot.isDragging
              ? 'shadow-card-dragging rotate-2 scale-105'
              : 'shadow-card hover:shadow-card-hover'
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Description preview */}
          {card.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {card.description}
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
}
