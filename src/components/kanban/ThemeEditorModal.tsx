import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { ThemeColorInput, getAccessibilityInfo } from './ThemeColorInput';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { cn } from '@/lib/utils';

export interface BoardTheme {
  id: string;
  name: string;
  is_default: boolean;
  navbar_color: string;
  column_color: string;
  default_card_color: string | null;
  card_window_color: string;
  card_window_text_color: string;
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
        setColumnColor(sourceTheme.column_color);
        setDefaultCardColor(sourceTheme.default_card_color);
        setCardWindowColor(sourceTheme.card_window_color);
        setCardWindowTextColor(sourceTheme.card_window_text_color);
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
                    label="Text Colour"
                    value={cardWindowTextColor}
                    onChange={(v) => setCardWindowTextColor(v || '#172b4d')}
                    contrastAgainst={cardWindowColor}
                  />
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
