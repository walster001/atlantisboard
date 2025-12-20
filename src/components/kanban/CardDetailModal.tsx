import { useState, useEffect } from 'react';
import { Card, Label, LABEL_COLORS, LabelColorName, getLabelHexColor } from '@/types/kanban';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { 
  Calendar as CalendarIcon, 
  X, 
  Tag, 
  Pencil, 
  AlignLeft, 
  Clock,
  Check,
  Trash2,
  Pipette
} from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { RichTextEditor } from './RichTextEditor';
import { CardAttachmentSection } from './CardAttachmentSection';
import { markdownToHtml } from '@/lib/markdownToHtml';

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

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

const PRESET_LABEL_COLORS: { name: LabelColorName; hex: string }[] = [
  { name: 'red', hex: LABEL_COLORS.red },
  { name: 'orange', hex: LABEL_COLORS.orange },
  { name: 'yellow', hex: LABEL_COLORS.yellow },
  { name: 'green', hex: LABEL_COLORS.green },
  { name: 'blue', hex: LABEL_COLORS.blue },
  { name: 'purple', hex: LABEL_COLORS.purple },
  { name: 'pink', hex: LABEL_COLORS.pink },
];

interface Attachment {
  id: string;
  card_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
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
  const [newLabelText, setNewLabelText] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState<string>(LABEL_COLORS.blue);
  const [customRgb, setCustomRgb] = useState({ r: 59, g: 130, b: 246 });
  const [customHex, setCustomHex] = useState<string>('#3b82f6');

  useEffect(() => {
    if (card) {
      // Strip HTML tags from title for plain text display
      setTitle(stripHtmlTags(card.title));
      // Convert markdown to HTML for description
      setDescription(markdownToHtml(card.description) || '');
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
      setIsEditingTitle(false);
      setIsEditingDescription(false);
    }
  }, [card]);

  const handleSaveTitle = () => {
    if (title.trim()) {
      onSave({ title: title.trim() });
      setIsEditingTitle(false);
    }
  };

  const handleSaveDescription = () => {
    onSave({ description: description || undefined });
    setIsEditingDescription(false);
  };

  const handleSaveDueDate = (date: Date | undefined) => {
    setDueDate(date);
    // Pass null explicitly to clear due date, or the date string to set it
    onSave({ dueDate: date === undefined ? null : date.toISOString() } as Partial<Card>);
  };

  const handleAddLabel = () => {
    if (!newLabelText.trim()) return;
    const newLabel: Label = {
      id: Math.random().toString(36).substr(2, 9),
      color: selectedLabelColor,
      text: newLabelText.trim(),
    };
    onAddLabel(newLabel);
    setNewLabelText('');
    setSelectedLabelColor(LABEL_COLORS.blue);
    setShowLabelPicker(false);
  };

  const handleSelectPresetColor = (hex: string) => {
    setSelectedLabelColor(hex);
    const rgb = hexToRgb(hex);
    if (rgb) {
      setCustomRgb(rgb);
      setCustomHex(hex);
    }
  };

  const handleCustomRgbChange = (channel: 'r' | 'g' | 'b', value: number) => {
    const newRgb = { ...customRgb, [channel]: value };
    setCustomRgb(newRgb);
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    setCustomHex(hex);
    setSelectedLabelColor(hex);
  };

  const handleCustomHexChange = (hex: string) => {
    setCustomHex(hex);
    const rgb = hexToRgb(hex);
    if (rgb) {
      setCustomRgb(rgb);
      setSelectedLabelColor(hex);
    }
  };

  const handleEyedropper = async () => {
    if ('EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        handleCustomHexChange(result.sRGBHex);
      } catch (e) {
        // User cancelled
      }
    }
  };

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
  const contentStyle: React.CSSProperties = themeCardWindowColor ? {
    maxHeight: 'calc(85vh - 2rem)',
    backgroundColor: themeCardWindowColor,
    color: effectiveTextColor || undefined,
  } : {
    maxHeight: 'calc(85vh - 2rem)',
  };

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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setTitle(card.title);
                    setIsEditingTitle(false);
                  }
                }}
              />
              <Button size="icon" variant="ghost" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => {
                setTitle(card.title);
                setIsEditingTitle(false);
              }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h2 
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
              <RichTextEditor
                content={description}
                onChange={setDescription}
                placeholder="Add a more detailed description..."
                autoSize
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
                "p-3 rounded-lg text-sm max-w-none",
                // Only use prose classes when no theme color is applied
                !themeCardWindowColor && "prose prose-sm dark:prose-invert prose-a:text-primary bg-muted/50 prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-blockquote:my-2 prose-pre:my-2 prose-code:text-xs prose-a:no-underline hover:prose-a:underline",
                !disabled && !themeCardWindowColor && "cursor-pointer hover:bg-muted transition-colors",
                !disabled && themeCardWindowColor && "cursor-pointer transition-opacity hover:opacity-80"
              )}
              style={themeCardWindowColor ? { 
                backgroundColor: `${effectiveTextColor}10`,
                color: effectiveTextColor,
              } : undefined}
              onClick={() => !disabled && setIsEditingDescription(true)}
            >
              <div 
                dangerouslySetInnerHTML={{ __html: description }} 
                className={cn(
                  "[&>pre]:p-3 [&>pre]:rounded-md [&>pre]:overflow-x-auto [&>pre]:font-mono [&>pre]:text-xs [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&>pre_code]:bg-transparent [&>pre_code]:p-0",
                  !themeCardWindowColor && "[&>pre]:bg-muted [&_code]:bg-muted/70",
                  // When theme color is applied, force inherit color on all text elements
                  themeCardWindowColor && "[&_*]:!text-inherit [&_h1]:!text-inherit [&_h2]:!text-inherit [&_h3]:!text-inherit [&_h4]:!text-inherit [&_h5]:!text-inherit [&_h6]:!text-inherit [&_p]:!text-inherit [&_li]:!text-inherit [&_strong]:!text-inherit [&_em]:!text-inherit [&_a]:!text-inherit [&_a]:underline [&_blockquote]:!text-inherit [&_blockquote]:opacity-80 [&>pre]:bg-black/10 [&_code]:bg-black/10"
                )}
                style={themeCardWindowColor ? {
                  color: effectiveTextColor,
                } : undefined}
              />
            </div>
          ) : (
            <div 
              className={cn(
                "p-3 rounded-lg text-sm min-h-[60px] italic flex items-center",
                !themeCardWindowColor && "bg-muted/50 text-muted-foreground",
                !disabled && !themeCardWindowColor && "cursor-pointer hover:bg-muted transition-colors",
                !disabled && themeCardWindowColor && "cursor-pointer transition-opacity hover:opacity-80"
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
              <PopoverContent className="w-80" align="start">
                <div className="space-y-3">
                  <div>
                    <Input
                      value={newLabelText}
                      onChange={(e) => setNewLabelText(e.target.value)}
                      placeholder="Label text (required)"
                      className="h-9"
                    />
                    {!newLabelText.trim() && (
                      <p className="text-xs text-muted-foreground mt-1">Enter label text to add</p>
                    )}
                  </div>
                  
                  <Tabs defaultValue="presets" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 h-8">
                      <TabsTrigger value="presets" className="text-xs">Presets</TabsTrigger>
                      <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
                    </TabsList>
                    <TabsContent value="presets" className="mt-2 space-y-3">
                      <div className="grid grid-cols-7 gap-2">
                        {PRESET_LABEL_COLORS.map((label) => (
                          <button
                            key={label.name}
                            onClick={() => handleSelectPresetColor(label.hex)}
                            className={cn(
                              "h-8 w-full rounded-md transition-all",
                              selectedLabelColor === label.hex 
                                ? "ring-2 ring-offset-2 ring-foreground" 
                                : "hover:ring-2 hover:ring-offset-2 hover:ring-foreground/20"
                            )}
                            style={{ backgroundColor: label.hex }}
                            title={label.name}
                          />
                        ))}
                      </div>
                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={handleAddLabel}
                        disabled={!newLabelText.trim()}
                      >
                        Add Label
                      </Button>
                    </TabsContent>
                    <TabsContent value="custom" className="mt-2 space-y-3">
                      <div className="flex gap-2">
                        <div
                          className="w-12 h-12 rounded-md border shrink-0"
                          style={{ backgroundColor: selectedLabelColor }}
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={customHex}
                              onChange={(e) => handleCustomHexChange(e.target.value)}
                              className="h-8 text-xs font-mono"
                              placeholder="#000000"
                              maxLength={7}
                            />
                            {'EyeDropper' in window && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={handleEyedropper}
                              >
                                <Pipette className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-4">R</span>
                          <Slider
                            value={[customRgb.r]}
                            onValueChange={([v]) => handleCustomRgbChange('r', v)}
                            max={255}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-xs w-8 text-right">{customRgb.r}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-4">G</span>
                          <Slider
                            value={[customRgb.g]}
                            onValueChange={([v]) => handleCustomRgbChange('g', v)}
                            max={255}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-xs w-8 text-right">{customRgb.g}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-4">B</span>
                          <Slider
                            value={[customRgb.b]}
                            onValueChange={([v]) => handleCustomRgbChange('b', v)}
                            max={255}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-xs w-8 text-right">{customRgb.b}</span>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={handleAddLabel}
                        disabled={!newLabelText.trim()}
                      >
                        Add Label
                      </Button>
                    </TabsContent>
                  </Tabs>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

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

  // Use Sheet on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-2xl" hideCloseButton>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col overflow-hidden" hideCloseButton>
        {content}
      </DialogContent>
    </Dialog>
  );
}
