import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { ThemeColorInput, getAccessibilityInfo } from './ThemeColorInput';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorHandler';
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
function getIntelligentTextColor(backgroundColor: string): string {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return '#172b4d';
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance < 0.5 ? '#ffffff' : '#172b4d';
}

export interface BoardTheme {
  id: string;
  name: string;
  is_default: boolean;
  navbar_color: string;
  column_color: string;
  default_card_color: string | null;
  card_window_color: string;
  card_window_text_color: string;
  card_window_button_color: string;
  card_window_button_text_color: string;
  card_window_button_hover_color: string;
  card_window_button_hover_text_color: string;
  card_window_intelligent_contrast: boolean;
  homepage_board_color: string;
  board_icon_color: string;
  scrollbar_color: string;
  scrollbar_track_color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ThemeEditorModalProps {
  open: boolean;
  onClose: () => void;
  onThemeSaved: () => void;
  editingTheme?: BoardTheme | null;
  duplicatingTheme?: BoardTheme | null;
}

export function ThemeEditorModal({ 
  open, 
  onClose, 
  onThemeSaved,
  editingTheme,
  duplicatingTheme
}: ThemeEditorModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  
  const [themeName, setThemeName] = useState('');
  const [navbarColor, setNavbarColor] = useState('#0079bf');
  const [columnColor, setColumnColor] = useState<string | null>('#f4f5f7');
  const [defaultCardColor, setDefaultCardColor] = useState<string | null>(null);
  const [cardWindowColor, setCardWindowColor] = useState('#ffffff');
  const [cardWindowTextColor, setCardWindowTextColor] = useState('#172b4d');
  const [cardWindowButtonColor, setCardWindowButtonColor] = useState('#0079bf');
  const [cardWindowButtonTextColor, setCardWindowButtonTextColor] = useState('#ffffff');
  const [cardWindowButtonHoverColor, setCardWindowButtonHoverColor] = useState('#005a8c');
  const [cardWindowButtonHoverTextColor, setCardWindowButtonHoverTextColor] = useState('#ffffff');
  const [cardWindowIntelligentContrast, setCardWindowIntelligentContrast] = useState(false);
  const [homepageBoardColor, setHomepageBoardColor] = useState('#0079bf');
  const [boardIconColor, setBoardIconColor] = useState('#ffffff');
  const [scrollbarColor, setScrollbarColor] = useState('#c1c7cd');
  const [scrollbarTrackColor, setScrollbarTrackColor] = useState('#f4f5f7');

  // Reset state when modal opens with new theme
  useEffect(() => {
    if (open) {
      const sourceTheme = duplicatingTheme || editingTheme;
      if (sourceTheme) {
        setThemeName(duplicatingTheme ? `${sourceTheme.name} (Copy)` : sourceTheme.name);
        setNavbarColor(sourceTheme.navbar_color);
        // Empty string means transparent, convert to null for state
        setColumnColor(sourceTheme.column_color === '' ? null : sourceTheme.column_color);
        setDefaultCardColor(sourceTheme.default_card_color);
        setCardWindowColor(sourceTheme.card_window_color);
        setCardWindowTextColor(sourceTheme.card_window_text_color);
        setCardWindowButtonColor(sourceTheme.card_window_button_color || '#0079bf');
        setCardWindowButtonTextColor(sourceTheme.card_window_button_text_color || '#ffffff');
        setCardWindowButtonHoverColor(sourceTheme.card_window_button_hover_color || '#005a8c');
        setCardWindowButtonHoverTextColor(sourceTheme.card_window_button_hover_text_color || '#ffffff');
        setCardWindowIntelligentContrast(sourceTheme.card_window_intelligent_contrast || false);
        setHomepageBoardColor(sourceTheme.homepage_board_color);
        setBoardIconColor(sourceTheme.board_icon_color);
        setScrollbarColor(sourceTheme.scrollbar_color);
        setScrollbarTrackColor(sourceTheme.scrollbar_track_color);
      } else {
        // Reset to defaults for new theme
        setThemeName('');
        setNavbarColor('#0079bf');
        setColumnColor('#f4f5f7');
        setDefaultCardColor(null);
        setCardWindowColor('#ffffff');
        setCardWindowTextColor('#172b4d');
        setCardWindowButtonColor('#0079bf');
        setCardWindowButtonTextColor('#ffffff');
        setCardWindowButtonHoverColor('#005a8c');
        setCardWindowButtonHoverTextColor('#ffffff');
        setCardWindowIntelligentContrast(false);
        setHomepageBoardColor('#0079bf');
        setBoardIconColor('#ffffff');
        setScrollbarColor('#c1c7cd');
        setScrollbarTrackColor('#f4f5f7');
      }
    }
  }, [open, editingTheme, duplicatingTheme]);

  // Check accessibility issues
  const cardWindowAccessibility = getAccessibilityInfo(cardWindowTextColor, cardWindowColor);
  const navbarIconAccessibility = getAccessibilityInfo(boardIconColor, navbarColor);
  
  const hasAccessibilityIssues = 
    cardWindowAccessibility.level === 'fail' || 
    navbarIconAccessibility.level === 'fail';

  const handleSave = async () => {
    if (!themeName.trim()) {
      toast({ title: 'Error', description: 'Please enter a theme name', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const themeData = {
        name: themeName.trim(),
        navbar_color: navbarColor,
        column_color: columnColor || '', // Empty string for transparent
        default_card_color: defaultCardColor,
        card_window_color: cardWindowColor,
        card_window_text_color: cardWindowTextColor,
        card_window_button_color: cardWindowButtonColor,
        card_window_button_text_color: cardWindowButtonTextColor,
        card_window_button_hover_color: cardWindowButtonHoverColor,
        card_window_button_hover_text_color: cardWindowButtonHoverTextColor,
        card_window_intelligent_contrast: cardWindowIntelligentContrast,
        homepage_board_color: homepageBoardColor,
        board_icon_color: boardIconColor,
        scrollbar_color: scrollbarColor,
        scrollbar_track_color: scrollbarTrackColor,
      };

      if (editingTheme) {
        const { error } = await supabase
          .from('board_themes')
          .update(themeData)
          .eq('id', editingTheme.id);
        if (error) throw error;
        toast({ title: 'Theme updated' });
      } else {
        const { error } = await supabase
          .from('board_themes')
          .insert(themeData);
        if (error) throw error;
        toast({ title: 'Theme created' });
      }
      
      onThemeSaved();
      onClose();
    } catch (error: any) {
      console.error('Save theme error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-2xl w-[95vw] h-[85vh] max-h-[85vh] p-0 overflow-hidden rounded-lg flex flex-col gap-0"
        hideCloseButton
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">
            {duplicatingTheme ? 'Duplicate Theme' : editingTheme ? 'Edit Theme' : 'Create New Theme'}
          </h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Theme Name */}
            <div className="space-y-2">
              <Label htmlFor="theme-name" className="text-sm font-medium">
                Theme Name
              </Label>
              <Input
                id="theme-name"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder="My Custom Theme"
                className="max-w-sm"
              />
            </div>

            {/* Accessibility Warnings */}
            {hasAccessibilityIssues && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    Accessibility Warning
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Some color combinations may have poor contrast for readability. 
                    Look for the warning icons below for suggestions.
                  </p>
                </div>
              </div>
            )}

            {/* Color Sections */}
            <div className="space-y-6">
              {/* Navbar Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Navbar
                </h3>
                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <ThemeColorInput
                    label="Background Colour"
                    value={navbarColor}
                    onChange={(v) => setNavbarColor(v || '#0079bf')}
                  />
                  <ThemeColorInput
                    label="Icon Colour"
                    value={boardIconColor}
                    onChange={(v) => setBoardIconColor(v || '#ffffff')}
                    contrastAgainst={navbarColor}
                  />
                </div>
              </div>

              {/* Lists/Columns Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Lists / Columns
                </h3>
                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <ThemeColorInput
                    label="Background Colour"
                    value={columnColor}
                    onChange={(v) => setColumnColor(v || '')}
                    allowNull
                    nullLabel="Transparent"
                  />
                  <p className="text-xs text-muted-foreground">
                    Set to transparent to use a see-through column background.
                  </p>
                </div>
              </div>

              {/* Default Card Colour Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Default Card Colour
                </h3>
                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <ThemeColorInput
                    label="Card Colour"
                    value={defaultCardColor}
                    onChange={(v) => setDefaultCardColor(v)}
                    allowNull
                    nullLabel="None"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cards can still have individual colours that override this default.
                  </p>
                </div>
              </div>

              {/* Card Window Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Card Detail Window
                </h3>
                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <ThemeColorInput
                    label="Background Colour"
                    value={cardWindowColor}
                    onChange={(v) => setCardWindowColor(v || '#ffffff')}
                  />
                  <ThemeColorInput
                    label="Text Colour (Labels & Headers)"
                    value={cardWindowTextColor}
                    onChange={(v) => setCardWindowTextColor(v || '#172b4d')}
                    contrastAgainst={cardWindowColor}
                  />
                  <p className="text-xs text-muted-foreground">
                    Applies to section labels, title, and headers. Description uses its own rich text styling.
                  </p>
                  <ThemeColorInput
                    label="Button Colour"
                    value={cardWindowButtonColor}
                    onChange={(v) => setCardWindowButtonColor(v || '#0079bf')}
                    contrastAgainst={cardWindowColor}
                  />
                  <ThemeColorInput
                    label="Button Text Colour"
                    value={cardWindowButtonTextColor}
                    onChange={(v) => setCardWindowButtonTextColor(v || '#ffffff')}
                    contrastAgainst={cardWindowButtonColor}
                  />
                  <ThemeColorInput
                    label="Button Hover Colour"
                    value={cardWindowButtonHoverColor}
                    onChange={(v) => setCardWindowButtonHoverColor(v || '#005a8c')}
                    contrastAgainst={cardWindowColor}
                  />
                  <ThemeColorInput
                    label="Button Hover Text Colour"
                    value={cardWindowButtonHoverTextColor}
                    onChange={(v) => setCardWindowButtonHoverTextColor(v || '#ffffff')}
                    contrastAgainst={cardWindowButtonHoverColor}
                  />
                  <p className="text-xs text-muted-foreground">
                    Button colours apply to due date, add label, and add attachment buttons.
                  </p>
                  
                  {/* Intelligent Contrast Toggle */}
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Intelligent Contrast</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically adjust text to white on dark backgrounds for better readability.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={cardWindowIntelligentContrast}
                      onClick={() => setCardWindowIntelligentContrast(!cardWindowIntelligentContrast)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        cardWindowIntelligentContrast ? "bg-primary" : "bg-input"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                          cardWindowIntelligentContrast ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Homepage Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Homepage
                </h3>
                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <ThemeColorInput
                    label="Board Tile Colour"
                    value={homepageBoardColor}
                    onChange={(v) => setHomepageBoardColor(v || '#0079bf')}
                  />
                </div>
              </div>

              {/* Scrollbars Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Scrollbars
                </h3>
                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  <ThemeColorInput
                    label="Scrollbar Colour"
                    value={scrollbarColor}
                    onChange={(v) => setScrollbarColor(v || '#c1c7cd')}
                  />
                  <ThemeColorInput
                    label="Track Colour"
                    value={scrollbarTrackColor}
                    onChange={(v) => setScrollbarTrackColor(v || '#f4f5f7')}
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Preview
              </h3>
              
              {/* Board Preview */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Board View</p>
                <div 
                  className="rounded-lg border overflow-hidden bg-[repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0_10px,#e8e8e8_10px,#e8e8e8_20px)]"
                >
                  {/* Mini navbar */}
                  <div 
                    className="h-8 flex items-center px-3 gap-2"
                    style={{ backgroundColor: navbarColor }}
                  >
                    <div 
                      className="h-4 w-4 rounded"
                      style={{ backgroundColor: boardIconColor }}
                    />
                    <div 
                      className="h-2 w-16 rounded"
                      style={{ backgroundColor: boardIconColor, opacity: 0.7 }}
                    />
                  </div>
                  {/* Mini board */}
                  <div className="p-3 flex gap-2">
                    {/* Column */}
                    <div 
                      className={cn(
                        "w-24 rounded p-2 space-y-1.5",
                        !columnColor && "bg-transparent"
                      )}
                      style={columnColor ? { backgroundColor: columnColor } : undefined}
                    >
                      <div className="h-2 w-12 bg-foreground/20 rounded" />
                      {/* Cards */}
                      <div 
                        className="h-6 rounded shadow-sm"
                        style={{ backgroundColor: defaultCardColor || '#ffffff' }}
                      />
                      <div 
                        className="h-6 rounded shadow-sm"
                        style={{ backgroundColor: defaultCardColor || '#ffffff' }}
                      />
                    </div>
                    <div 
                      className={cn(
                        "w-24 rounded p-2 space-y-1.5",
                        !columnColor && "bg-transparent"
                      )}
                      style={columnColor ? { backgroundColor: columnColor } : undefined}
                    >
                      <div className="h-2 w-8 bg-foreground/20 rounded" />
                      <div 
                        className="h-6 rounded shadow-sm"
                        style={{ backgroundColor: defaultCardColor || '#ffffff' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Detail Window Preview */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground font-medium">Card Detail Window</p>
                  {cardWindowIntelligentContrast && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                      Intelligent Contrast
                    </span>
                  )}
                </div>
                {(() => {
                  // Calculate effective text color for preview
                  const effectiveTextColor = cardWindowIntelligentContrast 
                    ? getIntelligentTextColor(cardWindowColor) 
                    : cardWindowTextColor;
                  
                  return (
                    <div 
                      className="rounded-lg border overflow-hidden shadow-lg"
                      style={{ backgroundColor: cardWindowColor }}
                    >
                      {/* Header */}
                      <div 
                        className="px-4 py-3 border-b flex items-start gap-3"
                        style={{ borderColor: `${effectiveTextColor}20` }}
                      >
                        <div 
                          className="w-5 h-5 rounded mt-0.5 shrink-0"
                          style={{ backgroundColor: defaultCardColor || '#0079bf' }}
                        />
                        <div className="flex-1 space-y-1">
                          <div 
                            className="h-4 w-32 rounded flex items-center text-[8px] font-semibold"
                            style={{ color: effectiveTextColor }}
                          >
                            Card Title
                          </div>
                          <div 
                            className="text-[7px]"
                            style={{ color: effectiveTextColor, opacity: 0.6 }}
                          >
                            in List Name
                          </div>
                        </div>
                        <div 
                          className="w-6 h-6 rounded flex items-center justify-center"
                          style={{ backgroundColor: `${effectiveTextColor}10` }}
                        >
                          <X className="w-3 h-3" style={{ color: effectiveTextColor }} />
                        </div>
                      </div>
                      {/* Content */}
                      <div className="px-4 py-3 space-y-3">
                        <div className="space-y-1.5">
                          <div 
                            className="text-[7px] font-medium"
                            style={{ color: effectiveTextColor, opacity: 0.7 }}
                          >
                            Description
                          </div>
                          <div 
                            className="h-3 w-full rounded"
                            style={{ backgroundColor: effectiveTextColor, opacity: 0.15 }}
                          />
                          <div 
                            className="h-3 w-3/4 rounded"
                            style={{ backgroundColor: effectiveTextColor, opacity: 0.15 }}
                          />
                        </div>
                        <div className="space-y-1">
                          <div 
                            className="text-[7px] font-medium"
                            style={{ color: effectiveTextColor, opacity: 0.7 }}
                          >
                            Due Date
                          </div>
                          <div className="flex gap-2">
                            <div 
                              className="h-5 w-16 rounded flex items-center justify-center text-[6px] font-medium cursor-pointer transition-colors hover:opacity-90"
                              style={{ 
                                backgroundColor: cardWindowButtonColor,
                                color: cardWindowButtonTextColor 
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = cardWindowButtonHoverColor;
                                e.currentTarget.style.color = cardWindowButtonHoverTextColor;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = cardWindowButtonColor;
                                e.currentTarget.style.color = cardWindowButtonTextColor;
                              }}
                            >
                              Set due date
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div 
                            className="text-[7px] font-medium"
                            style={{ color: effectiveTextColor, opacity: 0.7 }}
                          >
                            Labels
                          </div>
                          <div className="flex gap-1">
                            <div 
                              className="h-4 w-10 rounded flex items-center justify-center text-[6px] font-medium cursor-pointer transition-colors"
                              style={{ 
                                backgroundColor: cardWindowButtonColor,
                                color: cardWindowButtonTextColor 
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = cardWindowButtonHoverColor;
                                e.currentTarget.style.color = cardWindowButtonHoverTextColor;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = cardWindowButtonColor;
                                e.currentTarget.style.color = cardWindowButtonTextColor;
                              }}
                            >
                              + Label
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Footer */}
                      <div 
                        className="px-4 py-2 border-t flex justify-end gap-2"
                        style={{ borderColor: `${effectiveTextColor}20` }}
                      >
                        <div 
                          className="h-6 w-16 rounded"
                          style={{ backgroundColor: `${effectiveTextColor}10` }}
                        />
                        <div 
                          className="h-6 w-12 rounded"
                          style={{ backgroundColor: navbarColor }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingTheme ? 'Save Changes' : 'Create Theme'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
