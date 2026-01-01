import { useState, useRef, useEffect, useCallback } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { Column, Card } from '@/types/kanban';
import { KanbanCard } from './KanbanCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, Pencil, Trash2, Palette, XCircle, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColorPicker } from './ColorPicker';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';

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

interface MobileColumnCarouselProps {
  columns: Column[];
  onUpdateColumnTitle: (columnId: string, title: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onAddCard: (columnId: string, title: string) => void;
  onEditCard: (card: Card, columnId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onUpdateColumnColor: (columnId: string, color: string | null, isClearing?: boolean) => void;
  onApplyColumnColorToAll: (color: string | null) => void;
  onUpdateCardColor: (cardId: string, color: string | null) => void;
  onApplyCardColorToAll: (color: string | null) => void;
  onReorderColumns?: (fromIndex: number, toIndex: number) => void;
  onRefresh?: () => Promise<void>;
  disabled?: boolean;
  themeColumnColor?: string;
  themeCardColor?: string | null;
  themeScrollbarColor?: string;
  themeScrollbarTrackColor?: string;
}

export function MobileColumnCarousel({
  columns,
  onUpdateColumnTitle,
  onDeleteColumn,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onUpdateColumnColor,
  onApplyColumnColorToAll,
  onUpdateCardColor,
  onApplyCardColorToAll,
  onReorderColumns,
  onRefresh,
  disabled = false,
  themeColumnColor,
  themeCardColor,
  themeScrollbarColor,
  themeScrollbarTrackColor,
}: MobileColumnCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);
  
  // Dot drag-and-drop state
  const [draggingDotIndex, setDraggingDotIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dotTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDotDraggingRef = useRef(false);
  const LONG_PRESS_DELAY = 300; // ms delay before drag starts
  
  // Pull-to-refresh
  const PULL_THRESHOLD = 80;
  const {
    pullDistance,
    isRefreshing,
    handlers: pullHandlers,
  } = usePullToRefresh({
    onRefresh: onRefresh || (async () => {}),
    threshold: PULL_THRESHOLD,
    disabled: !onRefresh,
  });

  const activeColumn = columns[activeIndex];

  // Handle touch/swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
    isDraggingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    currentXRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    
    const diff = startXRef.current - currentXRef.current;
    const threshold = 50;
    
    if (diff > threshold && activeIndex < columns.length - 1) {
      setActiveIndex(activeIndex + 1);
    } else if (diff < -threshold && activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
  }, [activeIndex, columns.length]);

  const goToPrevious = () => {
    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
  };

  const goToNext = () => {
    if (activeIndex < columns.length - 1) {
      setActiveIndex(activeIndex + 1);
    }
  };

  const handleAddCard = () => {
    if (newCardTitle.trim() && activeColumn) {
      onAddCard(activeColumn.id, newCardTitle.trim());
      setNewCardTitle('');
      setIsAddingCard(false);
    }
  };

  const handleSaveTitle = () => {
    if (editedTitle.trim() && activeColumn) {
      onUpdateColumnTitle(activeColumn.id, editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  useEffect(() => {
    if (activeColumn) {
      setEditedTitle(activeColumn.title);
    }
  }, [activeColumn]);

  // Clamp activeIndex if columns change
  useEffect(() => {
    if (activeIndex >= columns.length && columns.length > 0) {
      setActiveIndex(columns.length - 1);
    }
  }, [columns.length, activeIndex]);
  
  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);
  
  // Dot drag handlers with delayed touch activation
  const handleDotTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    if (disabled || !onReorderColumns) return;
    
    const touch = e.touches[0];
    dotTouchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    
    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      isDotDraggingRef.current = true;
      setDraggingDotIndex(index);
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, LONG_PRESS_DELAY);
  }, [disabled, onReorderColumns]);
  
  const handleDotTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dotTouchStartRef.current) return;
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - dotTouchStartRef.current.x);
    const dy = Math.abs(touch.clientY - dotTouchStartRef.current.y);
    
    // If moved too much before long press, cancel the drag initiation
    if (!isDotDraggingRef.current && (dx > 10 || dy > 10)) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }
    
    // If dragging, find which dot we're over
    if (isDotDraggingRef.current) {
      e.preventDefault();
      const dotsContainer = (e.currentTarget as HTMLElement).parentElement;
      if (!dotsContainer) return;
      
      const dots = dotsContainer.querySelectorAll('[data-dot-index]');
      let newOverIndex: number | null = null;
      
      dots.forEach((dot) => {
        const rect = dot.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right) {
          newOverIndex = parseInt(dot.getAttribute('data-dot-index') || '0', 10);
        }
      });
      
      setDragOverIndex(newOverIndex);
    }
  }, []);
  
  const handleDotTouchEnd = useCallback(() => {
    // Cancel long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // If we were dragging and have a valid drop target, reorder
    if (isDotDraggingRef.current && draggingDotIndex !== null && dragOverIndex !== null && draggingDotIndex !== dragOverIndex) {
      onReorderColumns?.(draggingDotIndex, dragOverIndex);
      // Update active index to follow the moved column
      setActiveIndex(dragOverIndex);
    }
    
    // Reset state
    isDotDraggingRef.current = false;
    dotTouchStartRef.current = null;
    setDraggingDotIndex(null);
    setDragOverIndex(null);
  }, [draggingDotIndex, dragOverIndex, onReorderColumns]);

  if (!activeColumn) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-white/70">No columns yet</p>
      </div>
    );
  }

  // Calculate effective column color
  const isColumnTransparent = activeColumn.color === '' || activeColumn.color === 'transparent';
  const isThemeTransparent = themeColumnColor === '' || themeColumnColor === 'transparent';
  const effectiveColumnColor = isColumnTransparent 
    ? null 
    : (activeColumn.color || (isThemeTransparent ? null : themeColumnColor) || undefined);
    
  const columnTextMode = effectiveColumnColor ? getContrastTextColor(effectiveColumnColor) : 'dark';
  const isLightText = columnTextMode === 'light';

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full touch-pan-y relative"
      onTouchStart={(e) => {
        handleTouchStart(e);
        pullHandlers.onTouchStart(e);
      }}
      onTouchMove={(e) => {
        handleTouchMove(e);
        pullHandlers.onTouchMove(e);
      }}
      onTouchEnd={() => {
        handleTouchEnd();
        pullHandlers.onTouchEnd();
      }}
    >
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator 
        pullDistance={pullDistance} 
        isRefreshing={isRefreshing} 
        threshold={PULL_THRESHOLD} 
      />
      {/* Column navigation dots with drag reordering */}
      <div className="flex items-center justify-center gap-2 py-3 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-white/70 hover:text-white hover:bg-white/20 touch-manipulation"
          onClick={goToPrevious}
          disabled={activeIndex === 0}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <div className="flex items-center gap-2 px-2">
          {columns.map((col, idx) => (
            <button
              key={col.id}
              data-dot-index={idx}
              onClick={() => !isDotDraggingRef.current && setActiveIndex(idx)}
              onTouchStart={(e) => handleDotTouchStart(e, idx)}
              onTouchMove={handleDotTouchMove}
              onTouchEnd={handleDotTouchEnd}
              className={cn(
                "rounded-full transition-all duration-200 touch-manipulation",
                // Size: active is larger, dragging dot gets special style
                idx === activeIndex 
                  ? "w-8 h-3 bg-white" 
                  : "w-3 h-3 bg-white/40 hover:bg-white/60",
                // Dragging styles
                draggingDotIndex === idx && "scale-125 bg-primary shadow-lg ring-2 ring-primary/50",
                dragOverIndex === idx && draggingDotIndex !== idx && "ring-2 ring-white/80 scale-110",
                // Larger touch target via padding
                "p-1 -m-1"
              )}
              style={{
                // Visual indicator when being dragged over
                transform: dragOverIndex === idx && draggingDotIndex !== idx ? 'translateX(4px)' : undefined,
              }}
            />
          ))}
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-white/70 hover:text-white hover:bg-white/20 touch-manipulation"
          onClick={goToNext}
          disabled={activeIndex === columns.length - 1}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Drag hint text - shows when dragging */}
      {draggingDotIndex !== null && (
        <div className="text-center text-xs text-white/60 -mt-2 mb-1 animate-fade-in">
          Drag to reorder • Release to drop
        </div>
      )}

      {/* Active column */}
      <div className="flex-1 min-h-0 px-4 pb-4">
        <div 
          className={cn(
            "h-full rounded-xl p-3 flex flex-col",
            !effectiveColumnColor && "bg-column"
          )}
          style={effectiveColumnColor ? { backgroundColor: effectiveColumnColor } : undefined}
        >
          {/* Column header */}
          <div className="flex items-center justify-between mb-3">
            {isEditingTitle ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="h-9 text-sm font-semibold"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={handleSaveTitle}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setIsEditingTitle(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h3 className={cn(
                    "font-semibold text-base",
                    effectiveColumnColor 
                      ? (isLightText ? 'text-white drop-shadow-sm' : 'text-gray-900') 
                      : 'text-column-header'
                  )}>{activeColumn.title}</h3>
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    effectiveColumnColor 
                      ? (isLightText ? 'bg-black/20 text-white' : 'bg-white/40 text-gray-900') 
                      : 'text-muted-foreground bg-muted'
                  )}>
                    {activeColumn.cards.length}
                  </span>
                </div>
                {!disabled && (
                  <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-popover">
                      <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <ColorPicker
                        currentColor={activeColumn.color || null}
                        onApply={(color) => onUpdateColumnColor(activeColumn.id, color)}
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
                      {(activeColumn.color && activeColumn.color !== '' && activeColumn.color !== 'transparent') && (
                        <DropdownMenuItem onClick={() => {
                          onUpdateColumnColor(activeColumn.id, null, true);
                          setMenuOpen(false);
                        }}>
                          <XCircle className="h-4 w-4 mr-2" />
                          Clear Colour
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onDeleteColumn(activeColumn.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>

          {/* Cards list */}
          <Droppable droppableId={activeColumn.id} type="card">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  'flex-1 overflow-y-auto rounded-lg p-1 -m-1',
                  snapshot.isDraggingOver && 'drop-zone-active',
                  !themeScrollbarColor && 'scrollbar-thin'
                )}
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: themeScrollbarColor && themeScrollbarTrackColor 
                    ? `${themeScrollbarColor} ${themeScrollbarTrackColor}` 
                    : undefined,
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {activeColumn.cards.map((card, cardIndex) => (
                  <KanbanCard
                    key={card.id}
                    card={card}
                    index={cardIndex}
                    columnId={activeColumn.id}
                    onEdit={() => onEditCard(card, activeColumn.id)}
                    onDelete={() => onDeleteCard(card.id)}
                    onUpdateColor={(color) => onUpdateCardColor(card.id, color)}
                    onApplyColorToAll={onApplyCardColorToAll}
                    disabled={disabled}
                    themeCardColor={themeCardColor}
                  />
                ))}
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
              <div className="mt-3 animate-fade-in">
                <Input
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  placeholder="Enter card title..."
                  className="mb-2 h-10"
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
                  <Button size="sm" className="h-9" onClick={handleAddCard}>
                    Add Card
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9"
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
                className="w-full mt-3 justify-start text-muted-foreground hover:text-foreground h-10"
                onClick={() => setIsAddingCard(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add a card
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
