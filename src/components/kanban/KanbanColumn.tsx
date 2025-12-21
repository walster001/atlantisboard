import { useState, memo } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Column, Card } from '@/types/kanban';
import { KanbanCard } from './KanbanCard';
import { ColorPicker } from './ColorPicker';
import { MoreHorizontal, Plus, Trash2, Pencil, X, Check, Palette, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Helper function to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Calculate luminance for intelligent contrast
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Get intelligent contrast text color based on background
function getContrastTextColor(backgroundColor: string): 'light' | 'dark' {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return 'dark';
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance < 0.5 ? 'light' : 'dark';
}

interface KanbanColumnProps {
  column: Column;
  index: number;
  onUpdateTitle: (title: string) => void;
  onDelete: () => void;
  onAddCard: (title: string) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (cardId: string) => void;
  onUpdateColumnColor: (color: string | null, isClearing?: boolean) => void;
  onApplyColumnColorToAll: (color: string | null) => void;
  onUpdateCardColor: (cardId: string, color: string | null) => void;
  onApplyCardColorToAll: (color: string | null) => void;
  disabled?: boolean;
  themeColumnColor?: string;
  themeCardColor?: string | null;
  themeScrollbarColor?: string;
  themeScrollbarTrackColor?: string;
}

export const KanbanColumn = memo(function KanbanColumn({
  column,
  index,
  onUpdateTitle,
  onDelete,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onUpdateColumnColor,
  onApplyColumnColorToAll,
  onUpdateCardColor,
  onApplyCardColorToAll,
  disabled = false,
  themeColumnColor,
  themeCardColor,
  themeScrollbarColor,
  themeScrollbarTrackColor,
}: KanbanColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(column.title);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // Effective column color: per-column override > theme > default
  // Empty string or 'transparent' means transparent (no color)
  const isColumnTransparent = column.color === '' || column.color === 'transparent';
  const isThemeTransparent = themeColumnColor === '' || themeColumnColor === 'transparent';
  // If column has explicit transparent, use that; else if column has color, use it; else check theme
  const effectiveColumnColor = isColumnTransparent 
    ? null 
    : (column.color || (isThemeTransparent ? null : themeColumnColor) || undefined);
    
  // Calculate text color based on column background luminance
  const columnTextMode = effectiveColumnColor ? getContrastTextColor(effectiveColumnColor) : 'dark';
  const isLightText = columnTextMode === 'light';

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
    <Draggable draggableId={column.id} index={index} isDragDisabled={disabled}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="w-72 shrink-0 flex flex-col max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-6.5rem)] md:max-h-[calc(100vh-7rem)]"
        >
          <div 
            className={cn(
              "rounded-xl p-3 flex flex-col max-h-full overflow-hidden",
              !effectiveColumnColor && "bg-column"
            )}
            style={effectiveColumnColor ? { backgroundColor: effectiveColumnColor } : undefined}
          >
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
                    <h3 className={cn(
                      "font-semibold text-sm",
                      effectiveColumnColor 
                        ? (isLightText ? 'text-white drop-shadow-sm' : 'text-gray-900') 
                        : 'text-column-header'
                    )}>{column.title}</h3>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full",
                      effectiveColumnColor 
                        ? (isLightText ? 'bg-black/20 text-white' : 'bg-white/40 text-gray-900') 
                        : 'text-muted-foreground bg-muted'
                    )}>
                      {column.cards.length}
                    </span>
                  </div>
                  {!disabled && (
                    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-popover">
                        <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <ColorPicker
                          currentColor={column.color || null}
                          onApply={onUpdateColumnColor}
                          onApplyToAll={onApplyColumnColorToAll}
                          applyToAllLabel="Apply to All Columns"
                          onClose={() => setMenuOpen(false)}
                          showTransparent
                          trigger={
                            <DropdownMenuItem 
                              onSelect={(e) => e.preventDefault()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Palette className="h-4 w-4 mr-2" />
                              Column Colour
                            </DropdownMenuItem>
                          }
                        />
                        {(column.color && column.color !== '' && column.color !== 'transparent') && (
                          <DropdownMenuItem onClick={() => {
                            onUpdateColumnColor(null, true); // isClearing = true
                            setMenuOpen(false);
                          }}>
                            <XCircle className="h-4 w-4 mr-2" />
                            Clear Colour
                          </DropdownMenuItem>
                        )}
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

            {/* Cards - apply theme scrollbar colors */}
            <Droppable droppableId={column.id} type="card">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'min-h-[2rem] transition-all duration-200 rounded-lg flex-1 overflow-y-auto p-1 -m-1',
                    snapshot.isDraggingOver && 'drop-zone-active',
                    !themeScrollbarColor && 'scrollbar-thin'
                  )}
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: themeScrollbarColor && themeScrollbarTrackColor 
                      ? `${themeScrollbarColor} ${themeScrollbarTrackColor}` 
                      : undefined,
                    // Prevent scroll bouncing/glitching on fast scroll
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {column.cards.map((card, cardIndex) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      index={cardIndex}
                      columnId={column.id}
                      onEdit={() => onEditCard(card)}
                      onDelete={() => onDeleteCard(card.id)}
                      onUpdateColor={(color) => onUpdateCardColor(card.id, color)}
                      onApplyColorToAll={onApplyCardColorToAll}
                      disabled={disabled}
                      themeCardColor={themeCardColor}
                    />
                  ))}
                  {/* Styled placeholder showing drop position */}
                  <div className={cn(
                    'transition-all duration-200',
                    snapshot.isDraggingOver && 'ghost-placeholder min-h-[60px] mb-2'
                  )}>
                    {provided.placeholder}
                  </div>
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
});
