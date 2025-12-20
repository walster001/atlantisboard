import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CodeBlock from '@tiptap/extension-code-block';
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  List, 
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Quote,
  Minus,
  Type,
  Palette,
  RotateCcw,
  Link as LinkIcon,
  Code,
  Unlink,
  Trash2,
  ImagePlus,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  autoSize?: boolean;
}

interface SelectedIconState {
  element: HTMLImageElement;
  buttonSpan: HTMLElement;
  position: { top: number; left: number };
}

const presetColors = [
  '#000000', '#6b7280', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff',
];

export function RichTextEditor({ content, onChange, placeholder, className, autoSize = false }: RichTextEditorProps) {
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<SelectedIconState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false, // We use the separate extension
      }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline hover:text-primary/80',
        },
      }),
      CodeBlock.configure({
        HTMLAttributes: {
          class: 'bg-muted rounded-md p-3 font-mono text-sm overflow-x-auto',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2',
          autoSize ? 'min-h-[80px]' : 'min-h-[120px]'
        ),
      },
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  // Handle click on inline button icons
  const handleEditorClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Check if clicked element is an image inside a wekan inline button
    if (target.tagName === 'IMG') {
      const imgElement = target as HTMLImageElement;
      // Find parent span that matches the inline button pattern
      const parentSpan = imgElement.closest('span[style*="inline-flex"]') as HTMLElement;
      
      if (parentSpan) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get position relative to editor container
        const containerRect = editorContainerRef.current?.getBoundingClientRect();
        const imgRect = imgElement.getBoundingClientRect();
        
        if (containerRect) {
          setSelectedIcon({
            element: imgElement,
            buttonSpan: parentSpan,
            position: {
              top: imgRect.bottom - containerRect.top + 4,
              left: imgRect.left - containerRect.left + (imgRect.width / 2)
            }
          });
        }
      }
    } else if (!target.closest('.inline-icon-controls')) {
      // Close controls if clicking outside
      setSelectedIcon(null);
    }
  }, []);

  // Attach click listener to editor content
  useEffect(() => {
    const editorElement = editorContainerRef.current?.querySelector('.ProseMirror');
    if (editorElement) {
      editorElement.addEventListener('click', handleEditorClick as EventListener);
      return () => {
        editorElement.removeEventListener('click', handleEditorClick as EventListener);
      };
    }
  }, [handleEditorClick, editor]);

  // Close controls on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (selectedIcon && !editorContainerRef.current?.contains(e.target as Node)) {
        setSelectedIcon(null);
      }
    };
    
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [selectedIcon]);

  const handleDeleteIcon = useCallback(() => {
    if (!selectedIcon || !editor) return;
    
    // Remove only the image, keep the button span
    selectedIcon.element.remove();
    onChange(editor.getHTML());
    setSelectedIcon(null);
    toast.success('Icon removed');
  }, [selectedIcon, editor, onChange]);

  const handleReplaceIcon = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedIcon || !editor) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `inline-icon-${Date.now()}.${fileExt}`;
      const filePath = `inline-icons/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('card-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('card-attachments')
        .getPublicUrl(filePath);

      // Update the image src
      selectedIcon.element.src = urlData.publicUrl;
      onChange(editor.getHTML());
      setSelectedIcon(null);
      toast.success('Icon replaced');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedIcon, editor, onChange]);

  if (!editor) {
    return null;
  }

  const handleSetLink = () => {
    if (linkUrl) {
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkUrl('');
    setShowLinkPopover(false);
  };

  const handleUnsetLink = () => {
    editor.chain().focus().unsetLink().run();
  };

  const ToolbarButton = ({ 
    onClick, 
    isActive = false, 
    children, 
    title 
  }: { 
    onClick: () => void; 
    isActive?: boolean; 
    children: React.ReactNode;
    title: string;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-8 w-8 p-0",
        isActive && "bg-muted text-primary"
      )}
      title={title}
    >
      {children}
    </Button>
  );

  return (
    <div ref={editorContainerRef} className={cn("border rounded-lg bg-background relative", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1 border-b bg-muted/30">
        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          isActive={editor.isActive('paragraph')}
          title="Paragraph"
        >
          <Type className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Quote, Code & Divider */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Quote"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          title="Code Block"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Link */}
        <Popover open={showLinkPopover} onOpenChange={setShowLinkPopover}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-8 w-8 p-0", editor.isActive('link') && "bg-muted text-primary")}
              title="Add Link"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-3">
              <Label className="text-xs font-medium">Link URL</Label>
              <div className="flex gap-2">
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleSetLink()}
                />
                <Button size="sm" onClick={handleSetLink}>
                  Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        {editor.isActive('link') && (
          <ToolbarButton onClick={handleUnsetLink} title="Remove Link">
            <Unlink className="h-4 w-4" />
          </ToolbarButton>
        )}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Text Color */}
        <Popover modal={true}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 relative"
              title="Text Color"
            >
              <Palette className="h-4 w-4" />
              <div 
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full"
                style={{ backgroundColor: customColor }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Text Color</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => editor.chain().focus().unsetColor().run()}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>
              
              {/* Color picker input */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value);
                      editor.chain().focus().setColor(e.target.value).run();
                    }}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="text"
                    value={customColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomColor(val);
                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                        editor.chain().focus().setColor(val).run();
                      }
                    }}
                    placeholder="#000000"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Preset colors */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Presets</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        setCustomColor(color);
                        editor.chain().focus().setColor(color).run();
                      }}
                      className={cn(
                        "h-6 w-6 rounded border hover:scale-110 transition-transform",
                        color === '#ffffff' ? 'border-border' : 'border-transparent'
                      )}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* Hidden file input for icon replacement */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Floating controls for inline button icons */}
      {selectedIcon && (
        <div
          className="inline-icon-controls absolute z-50 flex items-center gap-1 bg-popover border border-border rounded-lg shadow-lg p-1"
          style={{
            top: selectedIcon.position.top,
            left: selectedIcon.position.left,
            transform: 'translateX(-50%)'
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReplaceIcon}
            disabled={isUploading}
            className="h-8 px-2 gap-1.5 text-xs"
            title="Replace icon"
          >
            <ImagePlus className="h-4 w-4" />
            {isUploading ? 'Uploading...' : 'Replace'}
          </Button>
          <div className="w-px h-5 bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDeleteIcon}
            disabled={isUploading}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Delete icon"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIcon(null)}
            className="h-8 w-8 p-0"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Editor Styles */}
      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 0.5rem;
          margin-bottom: 0.25rem;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .ProseMirror li {
          margin: 0.25rem 0;
        }
        .ProseMirror blockquote {
          border-left: 3px solid hsl(var(--border));
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: hsl(var(--muted-foreground));
        }
        .ProseMirror hr {
          border: none;
          border-top: 1px solid hsl(var(--border));
          margin: 1rem 0;
        }
        .ProseMirror p {
          margin-bottom: 0.5rem;
        }
        .ProseMirror p:last-child {
          margin-bottom: 0;
        }
        .ProseMirror br {
          display: block;
          content: "";
        }
        .ProseMirror pre {
          background: hsl(var(--muted));
          border-radius: 0.375rem;
          padding: 0.75rem;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.875rem;
          overflow-x: auto;
          margin: 0.5rem 0;
        }
        .ProseMirror code {
          background: hsl(var(--muted));
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.875em;
        }
        .ProseMirror pre code {
          background: none;
          padding: 0;
        }
        .ProseMirror a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        .ProseMirror a:hover {
          color: hsl(var(--primary) / 0.8);
        }
        /* Inline button icon selection styles */
        .ProseMirror span[style*="inline-flex"] img {
          cursor: pointer;
          transition: outline 0.15s ease, transform 0.15s ease;
          border-radius: 2px;
        }
        .ProseMirror span[style*="inline-flex"] img:hover {
          outline: 2px solid hsl(var(--primary));
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}
