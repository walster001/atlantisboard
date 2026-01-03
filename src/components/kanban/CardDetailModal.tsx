/**
 * CardDetailModal.tsx
 * 
 * Modal component for viewing and editing card details.
 * Uses ToastUIMarkdownEditor for editing and MarkdownRenderer for display.
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Card, Label, getLabelHexColor } from '@/types/kanban';
import { SwipeableSheet } from '@/components/ui/swipeable-sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Calendar as CalendarIcon, 
  X, 
  Tag, 
  Pencil, 
  AlignLeft, 
  Clock,
  Check,
  Trash2,
  ListTodo,
} from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { ToastUIMarkdownEditor } from './ToastUIMarkdownEditor';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CardAttachmentSection } from './CardAttachmentSection';
import { CardSubtaskSection, Subtask } from './CardSubtaskSection';
import type { InlineButtonData } from './InlineButtonEditor';
import { observeTwemoji } from '@/lib/twemojiUtils';

// Strip HTML tags from text for plain display
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

// Helper functions for color conversion
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

interface BoardLabel {
  id: string;
  board_id: string;
  name: string;
  color: string;
}

interface Attachment {
  id: string;
  cardId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  fileType: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

interface CardDetailModalProps {
  card: Card | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Card>) => void;
  onAddLabel: (label: Label) => void;
  onRemoveLabel: (labelId: string) => void;
  onDelete?: () => void;
  disabled?: boolean;
  attachments?: Attachment[];
  onAttachmentsChange?: () => void;
  subtasks?: Subtask[];
  onSubtasksChange?: () => void;
  boardLabels?: BoardLabel[];
  themeCardWindowColor?: string;
  themeCardWindowTextColor?: string;
  themeCardWindowButtonColor?: string;
  themeCardWindowButtonTextColor?: string;
  themeCardWindowButtonHoverColor?: string;
  themeCardWindowButtonHoverTextColor?: string;
  themeCardWindowIntelligentContrast?: boolean;
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
function getIntelligentTextColor(backgroundColor: string): string {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return '#172b4d';
  
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  // Use white text for dark backgrounds (luminance < 0.5)
  return luminance < 0.5 ? '#ffffff' : '#172b4d';
}

export function CardDetailModal({
  card,
  open,
  onClose,
  onSave,
  onAddLabel,
  onRemoveLabel,
  onDelete,
  disabled = false,
  attachments = [],
  onAttachmentsChange,
  subtasks = [],
  onSubtasksChange,
  boardLabels = [],
  themeCardWindowColor,
  themeCardWindowTextColor,
  themeCardWindowButtonColor,
  themeCardWindowButtonTextColor,
  themeCardWindowButtonHoverColor,
  themeCardWindowButtonHoverTextColor,
  themeCardWindowIntelligentContrast,
}: CardDetailModalProps) {
  const isMobile = useIsMobile();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Sync state from card prop when card changes
  useEffect(() => {
    if (card) {
      setTitle(stripHtmlTags(card.title));
      setDescription(card.description || '');
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
      setIsEditingTitle(false);
      setIsEditingDescription(false);
    }
  }, [card]);

  // Apply Twemoji to title - useLayoutEffect prevents flicker
  useLayoutEffect(() => {
    if (!isEditingTitle && titleRef.current) {
      const cleanup = observeTwemoji(titleRef.current, 'twemoji-title');
      return cleanup;
    }
  }, [title, isEditingTitle]);

  const handleSaveTitle = () => {
    if (title.trim()) {
      onSave({ title: title.trim() });
      setIsEditingTitle(false);
    }
  };

  const handleSaveDescription = () => {
    setIsEditingDescription(false);
    onSave({ description: description || undefined });
  };

  const handleSaveDueDate = (date: Date | undefined) => {
    setDueDate(date);
    // Pass null explicitly to clear due date, or the date string to set it
    onSave({ dueDate: date === undefined ? null : date.toISOString() } as Partial<Card>);
  };

  // Add existing board label to this card
  const handleSelectBoardLabel = (boardLabel: BoardLabel) => {
    // Check if label is already on the card
    if (card?.labels.some(l => l.id === boardLabel.id)) {
      return; // Already added
    }
    const label: Label = {
      id: boardLabel.id,
      color: boardLabel.color,
      text: boardLabel.name,
    };
    onAddLabel(label);
    setShowLabelPicker(false);
  };

  /**
   * Handle inline button clicks from the MarkdownRenderer.
   * Opens the button's URL in a new tab.
   */
  const handleInlineButtonClick = useCallback((data: InlineButtonData) => {
    if (data.linkUrl) {
      const url = data.linkUrl.startsWith('http') ? data.linkUrl : `https://${data.linkUrl}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  /**
   * Handle clicks on the description area to enter edit mode.
   * (Inline button clicks are handled separately by the MarkdownRenderer)
   */
  const handleDescriptionContainerClick = useCallback(() => {
    if (!disabled) {
      setIsEditingDescription(true);
    }
  }, [disabled]);

  if (!card) return null;

  const dueDateStatus = dueDate ? {
    isOverdue: isPast(dueDate) && !isToday(dueDate),
    isDueToday: isToday(dueDate),
  } : null;

  // Calculate effective text color with intelligent contrast
  const effectiveTextColor = themeCardWindowIntelligentContrast && themeCardWindowColor
    ? getIntelligentTextColor(themeCardWindowColor)
    : themeCardWindowTextColor;

  // Apply theme colors - use CSS custom properties for text color inheritance
  // Height is now controlled by the dialog wrapper (100vh - 20px padding)
  const contentStyle: React.CSSProperties = themeCardWindowColor ? {
    backgroundColor: themeCardWindowColor,
    color: effectiveTextColor || undefined,
  } : {};

  // Check if custom button colors are provided
  const hasCustomButtonColors = !!themeCardWindowButtonColor;
  
  
  // CSS custom properties for container to enable hover states
  const containerStyle: React.CSSProperties = hasCustomButtonColors ? {
    '--theme-btn-bg': themeCardWindowButtonColor,
    '--theme-btn-color': themeCardWindowButtonTextColor || '#ffffff',
    '--theme-btn-hover-bg': themeCardWindowButtonHoverColor || themeCardWindowButtonColor,
    '--theme-btn-hover-color': themeCardWindowButtonHoverTextColor || themeCardWindowButtonTextColor || '#ffffff',
  } as React.CSSProperties : {};

  // Button styles - use inline styles with custom properties to override tailwind classes
  const buttonStyle: React.CSSProperties = hasCustomButtonColors ? {
    backgroundColor: themeCardWindowButtonColor,
    color: themeCardWindowButtonTextColor || '#ffffff',
    borderColor: themeCardWindowButtonColor,
  } : {};
  
  // Button class for hover states
  const themedButtonClass = hasCustomButtonColors ? 'themed-button' : '';

  const content = (
    <div className="flex flex-col overflow-hidden" style={{ ...contentStyle, ...containerStyle }}>
      {/* Header */}
      <div 
        className="flex items-start justify-between p-4 md:p-6 border-b"
        style={themeCardWindowColor ? { borderColor: effectiveTextColor ? `${effectiveTextColor}20` : undefined } : undefined}
      >
        <div className="flex-1 min-w-0">

          {/* Title */}
          {isEditingTitle && !disabled ? (
            <div className="flex items-center gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xl font-semibold"
                autoFocus
                onBlur={() => {
                  // Auto-save title on blur if it has changed
                  if (title.trim() && title.trim() !== stripHtmlTags(card.title)) {
                    handleSaveTitle();
                  } else {
                    setIsEditingTitle(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setTitle(stripHtmlTags(card.title));
                    setIsEditingTitle(false);
                  }
                }}
              />
              <Button size="icon" variant="ghost" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => {
                setTitle(stripHtmlTags(card.title));
                setIsEditingTitle(false);
              }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <h2 
                ref={titleRef}
                className={cn(
                  "text-xl md:text-2xl font-semibold",
                  !effectiveTextColor && "text-foreground",
                  !disabled && "cursor-pointer hover:opacity-70 transition-opacity"
                )}
                style={effectiveTextColor ? { color: effectiveTextColor } : undefined}
                onClick={() => !disabled && setIsEditingTitle(true)}
              >
                {title}
              </h2>
            </>
          )}
        </div>
        
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 ml-2">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6">
        {/* Description Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div 
              className={cn("flex items-center gap-2", !effectiveTextColor && "text-muted-foreground")}
              style={effectiveTextColor ? { color: effectiveTextColor, opacity: 0.7 } : undefined}
            >
              <AlignLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Description</span>
            </div>
            {!disabled && !isEditingDescription && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingDescription(true)}
                className="h-8"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
          
          {isEditingDescription && !disabled ? (
            <div className="space-y-2">
              {/* 
                ToastUIMarkdownEditor: WYSIWYG editor using Toast UI.
                Handles inline buttons properly.
              */}
              <ToastUIMarkdownEditor
                content={description}
                onChange={setDescription}
                placeholder="Add a more detailed description in Markdown..."
                themeBackgroundColor={themeCardWindowColor}
                themeTextColor={effectiveTextColor}
                useIntelligentContrast={themeCardWindowIntelligentContrast}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveDescription}>
                  Save
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => {
                    setDescription(card.description || '');
                    setIsEditingDescription(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : description ? (
            <div 
              className={cn(
                "p-3 rounded-lg text-sm",
                !themeCardWindowColor && "bg-muted/50",
                !disabled && "cursor-pointer"
              )}
              style={themeCardWindowColor ? { 
                backgroundColor: `${effectiveTextColor}10`,
              } : undefined}
              onClick={handleDescriptionContainerClick}
            >
              {/* 
                MarkdownRenderer: Secure renderer that does NOT use dangerouslySetInnerHTML.
                Safely renders Markdown with GFM (tables, task lists, strikethrough),
                emoji shortcodes, and sanitized HTML.
              */}
              <MarkdownRenderer
                content={description}
                themeTextColor={effectiveTextColor}
                themeBackgroundColor={themeCardWindowColor}
                onInlineButtonClick={handleInlineButtonClick}
              />
            </div>
          ) : (
            <div 
              className={cn(
                "p-3 rounded-lg text-sm min-h-[60px] italic flex items-center",
                !themeCardWindowColor && "bg-muted/50 text-muted-foreground",
                !disabled && "cursor-pointer"
              )}
              style={themeCardWindowColor ? { 
                backgroundColor: `${effectiveTextColor}10`,
                color: effectiveTextColor,
                opacity: 0.7
              } : undefined}
              onClick={() => !disabled && setIsEditingDescription(true)}
            >
              {disabled ? 'No description' : 'Click to add a description...'}
            </div>
          )}
        </div>

        {/* Due Date Section */}
        <div className="space-y-2">
          <div 
            className={cn("flex items-center gap-2", !effectiveTextColor && "text-muted-foreground")}
            style={effectiveTextColor ? { color: effectiveTextColor, opacity: 0.7 } : undefined}
          >
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Due Date</span>
          </div>
          
          {disabled ? (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              dueDateStatus?.isOverdue && 'bg-destructive/10 text-destructive',
              dueDateStatus?.isDueToday && 'bg-label-orange/10 text-label-orange',
              !dueDateStatus && 'bg-muted text-muted-foreground',
              dueDate && !dueDateStatus?.isOverdue && !dueDateStatus?.isDueToday && 'bg-muted'
            )}>
              <CalendarIcon className="h-4 w-4" />
              {dueDate ? format(dueDate, 'PPP') : 'No due date'}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={hasCustomButtonColors && !dueDateStatus?.isOverdue && !dueDateStatus?.isDueToday ? "default" : "outline"}
                    className={cn(
                      'justify-start text-left font-normal',
                      !dueDate && !hasCustomButtonColors && 'text-muted-foreground',
                      dueDateStatus?.isOverdue && 'border-destructive text-destructive bg-transparent',
                      dueDateStatus?.isDueToday && 'border-label-orange text-label-orange bg-transparent',
                      !dueDateStatus?.isOverdue && !dueDateStatus?.isDueToday && themedButtonClass
                    )}
                    style={!dueDateStatus?.isOverdue && !dueDateStatus?.isDueToday && hasCustomButtonColors ? buttonStyle : undefined}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'PPP') : 'Set due date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={handleSaveDueDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {dueDate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleSaveDueDate(undefined)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Labels Section */}
        <div className="space-y-2">
          <div 
            className={cn("flex items-center gap-2", !effectiveTextColor && "text-muted-foreground")}
            style={effectiveTextColor ? { color: effectiveTextColor, opacity: 0.7 } : undefined}
          >
            <Tag className="h-4 w-4" />
            <span className="text-sm font-medium">Labels</span>
          </div>
          
          {/* Display existing labels */}
          {card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.labels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: getLabelHexColor(label.color) }}
                >
                  {label.text || label.color}
                  {!disabled && (
                    <button
                      onClick={() => onRemoveLabel(label.id)}
                      className="hover:bg-white/20 rounded-full p-0.5 ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          
          {card.labels.length === 0 && disabled && (
            <span className="text-sm text-muted-foreground italic">No labels</span>
          )}
          
          {!disabled && (
            <Popover open={showLabelPicker} onOpenChange={setShowLabelPicker}>
              <PopoverTrigger asChild>
                <Button 
                  variant={hasCustomButtonColors ? "default" : "outline"} 
                  size="sm"
                  className={themedButtonClass}
                  style={hasCustomButtonColors ? buttonStyle : undefined}
                >
                  <Tag className="h-3.5 w-3.5 mr-1.5" />
                  Add Label
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Select a label</p>
                  {boardLabels.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No labels available. Create labels in Board Settings → Labels.
                    </p>
                  ) : (
                    <ScrollArea className="max-h-64">
                      <div className="space-y-1 pr-3">
                        {boardLabels.map((boardLabel) => {
                          const isAlreadyAdded = card?.labels.some(l => l.id === boardLabel.id);
                          return (
                            <button
                              key={boardLabel.id}
                              onClick={() => !isAlreadyAdded && handleSelectBoardLabel(boardLabel)}
                              disabled={isAlreadyAdded}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors",
                                isAlreadyAdded 
                                  ? "opacity-50 cursor-not-allowed" 
                                  : "hover:bg-muted"
                              )}
                            >
                              <div
                                className="w-6 h-6 rounded shrink-0"
                                style={{ backgroundColor: boardLabel.color }}
                              />
                              <span className="text-sm flex-1 truncate">{boardLabel.name}</span>
                              {isAlreadyAdded && (
                                <Check className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Checklist/Subtasks Section */}
        <CardSubtaskSection
          cardId={card.id}
          subtasks={subtasks}
          onSubtasksChange={onSubtasksChange || (() => {})}
          disabled={disabled}
          themeTextColor={effectiveTextColor}
          themeButtonColor={themeCardWindowButtonColor}
          themeButtonTextColor={themeCardWindowButtonTextColor}
          themeButtonHoverColor={themeCardWindowButtonHoverColor}
          themeButtonHoverTextColor={themeCardWindowButtonHoverTextColor}
        />

        {/* Attachments Section */}
        <CardAttachmentSection
          cardId={card.id}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange || (() => {})}
          disabled={disabled}
          themeTextColor={effectiveTextColor}
          themeButtonColor={themeCardWindowButtonColor}
          themeButtonTextColor={themeCardWindowButtonTextColor}
          themeButtonHoverColor={themeCardWindowButtonHoverColor}
          themeButtonHoverTextColor={themeCardWindowButtonHoverTextColor}
        />
      </div>

      {/* Footer Actions */}
      {!disabled && onDelete && (
        <div 
          className="border-t p-4 md:p-6"
          style={themeCardWindowColor ? { borderColor: effectiveTextColor ? `${effectiveTextColor}20` : undefined } : undefined}
        >
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full sm:w-auto"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Card
          </Button>
        </div>
      )}
    </div>
  );

  // Use SwipeableSheet on mobile for swipe-to-dismiss, Dialog on desktop
  if (isMobile) {
    return (
      <SwipeableSheet open={open} onOpenChange={onClose}>
        {content}
      </SwipeableSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="!w-[50vw] !max-w-none !h-[calc(100vh-20px)] !max-h-none p-0 flex flex-col overflow-hidden" 
        hideCloseButton
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
