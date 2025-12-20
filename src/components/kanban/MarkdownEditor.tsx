/**
 * MarkdownEditor.tsx
 * 
 * A WYSIWYG-style Markdown editor that provides a visual editing experience
 * similar to HTML editors, while storing content as Markdown.
 * 
 * Features:
 * - Visual WYSIWYG editing using TipTap
 * - Toolbar buttons for formatting (bold, italic, headings, lists, etc.)
 * - Inline button creator integration
 * - Stores and outputs Markdown format
 * - Converts legacy HTML content to Markdown on load
 * - GFM support (tables, task lists, strikethrough)
 * 
 * The editor internally uses HTML for the visual editing experience,
 * but converts to/from Markdown when loading and saving content.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CodeBlock from '@tiptap/extension-code-block';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
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
  SquareArrowOutUpRight,
  Table,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { InlineButtonEditor, InlineButtonData, parseInlineButtonFromDataAttr } from './InlineButtonEditor';

// ============================================================================
// Types
// ============================================================================

interface MarkdownEditorProps {
  /** Current content (Markdown or legacy HTML) */
  content: string;
  /** Called when content changes - receives Markdown */
  onChange: (markdown: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Auto-size editor height */
  autoSize?: boolean;
}

// ============================================================================
// Color Presets
// ============================================================================

const presetColors = [
  '#000000', '#6b7280', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff',
];

// ============================================================================
// Markdown <-> HTML Conversion Utilities
// ============================================================================

/**
 * Configure Turndown for HTML to Markdown conversion.
 * Includes GFM support for tables, strikethrough, and task lists.
 */
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  
  // Add GFM plugin for tables, strikethrough, task lists
  turndown.use(gfm);
  
  // Custom rule for inline buttons - convert to our special format
  turndown.addRule('inlineButton', {
    filter: (node) => {
      return (
        node.nodeName === 'SPAN' &&
        node.classList?.contains('editable-inline-button')
      );
    },
    replacement: (_content, node) => {
      const dataAttr = (node as HTMLElement).getAttribute('data-inline-button');
      if (dataAttr) {
        return `[INLINE_BUTTON:${dataAttr}]`;
      }
      return '';
    },
  });
  
  // Keep colored spans as HTML since markdown doesn't support colors
  turndown.addRule('coloredText', {
    filter: (node) => {
      return (
        node.nodeName === 'SPAN' &&
        !node.classList?.contains('editable-inline-button') &&
        (node as HTMLElement).style?.color
      );
    },
    replacement: (content, node) => {
      const color = (node as HTMLElement).style.color;
      if (color) {
        return `<span style="color: ${color}">${content}</span>`;
      }
      return content;
    },
  });
  
  return turndown;
}

/**
 * Convert HTML to Markdown.
 */
function htmlToMarkdown(html: string): string {
  if (!html?.trim()) return '';
  
  const turndown = createTurndownService();
  
  try {
    return turndown.turndown(html).trim();
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    return html;
  }
}

/**
 * Configure marked for Markdown to HTML conversion.
 */
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert Markdown to HTML for the editor.
 * Also handles our special inline button format and legacy HTML content.
 */
function markdownToHtml(markdown: string): string {
  if (!markdown?.trim()) return '';
  
  try {
    let html = markdown;
    
    // First, convert inline button placeholders to HTML
    // Format: [INLINE_BUTTON:base64data]
    html = html.replace(/\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g, (_match, dataAttr) => {
      const data = parseInlineButtonFromDataAttr(dataAttr);
      if (data) {
        return serializeInlineButtonHtml(data);
      }
      return '';
    });
    
    // Check if content is already HTML (legacy imported content)
    const trimmed = html.trim();
    const isHtml = (
      (trimmed.startsWith('<') && (
        trimmed.startsWith('<p>') ||
        trimmed.startsWith('<p ') ||
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<span')
      )) ||
      /<(p|h[1-6]|ul|ol|li|div|blockquote|pre|strong|em|a|span|br)\b[^>]*>/i.test(html)
    );
    
    if (isHtml) {
      // Already HTML, transform Wekan inline buttons and return
      return transformLegacyInlineButtons(html);
    }
    
    // Convert markdown to HTML
    const result = marked.parse(html, { async: false }) as string;
    
    return result;
  } catch (error) {
    console.error('Error converting Markdown to HTML:', error);
    return `<p>${markdown}</p>`;
  }
}

/**
 * Transform legacy Wekan inline buttons to our editable format.
 */
function transformLegacyInlineButtons(html: string): string {
  // Pattern for Wekan-style inline buttons
  const wekanPattern = /<span[^>]*style=['"][^'"]*display\s*:\s*inline-?flex[^'"]*['"][^>]*>([\s\S]*?)<\/span>/gi;
  
  return html.replace(wekanPattern, (match) => {
    // Check if it's already our format
    if (match.includes('editable-inline-button')) {
      return match;
    }
    
    // Extract icon, link, and text
    const imgMatch = match.match(/<img[^>]*src=['"]([^'"]+)['"][^>]*>/i);
    const anchorMatch = match.match(/<a[^>]*href=['"]([^'"]+)['"][^>]*>([^<]*)<\/a>/i);
    const bgColorMatch = match.match(/background(?:-color)?:\s*([^;'"]+)/i);
    const textColorMatch = match.match(/(?:^|[^-])color:\s*([^;'"]+)/i);
    
    if (anchorMatch) {
      const data: InlineButtonData = {
        id: `wekan-btn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        iconUrl: imgMatch?.[1] || '',
        iconSize: 16,
        linkUrl: anchorMatch[1] || '',
        linkText: anchorMatch[2]?.trim() || 'Button',
        textColor: textColorMatch?.[1]?.trim() || '#579DFF',
        backgroundColor: bgColorMatch?.[1]?.trim() || '#1D2125',
      };
      return serializeInlineButtonHtml(data);
    }
    
    return match;
  });
}

/**
 * Serialize inline button data to HTML for the editor.
 */
function serializeInlineButtonHtml(data: InlineButtonData): string {
  const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return `<span class="editable-inline-button" data-inline-button="${encodedData}" data-bg-color="${data.backgroundColor}" data-text-color="${data.textColor}" data-link-url="${data.linkUrl}" contenteditable="false" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background-color:${data.backgroundColor};border:1px solid #3d444d;white-space:nowrap;cursor:pointer;">${
    data.iconUrl ? `<img src="${data.iconUrl}" alt="" style="width:${data.iconSize}px;height:${data.iconSize}px;object-fit:contain;flex-shrink:0;">` : ''
  }<span class="inline-button-text" style="color:${data.textColor};text-decoration:none;white-space:nowrap;">${data.linkText}</span></span>`;
}

// ============================================================================
// Toolbar Button Component
// ============================================================================

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, isActive = false, children, title }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-8 w-8 p-0',
        isActive && 'bg-muted text-primary'
      )}
      title={title}
    >
      {children}
    </Button>
  );
}

// ============================================================================
// Main Editor Component
// ============================================================================

export function MarkdownEditor({
  content,
  onChange,
  placeholder,
  className,
  autoSize = false,
}: MarkdownEditorProps) {
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showInlineButtonEditor, setShowInlineButtonEditor] = useState(false);
  const [editingButtonData, setEditingButtonData] = useState<InlineButtonData | null>(null);
  const [editingButtonElement, setEditingButtonElement] = useState<HTMLElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  
  // Track if we're currently syncing to prevent loops
  const isSyncing = useRef(false);
  
  // Convert initial markdown content to HTML for the editor
  const initialHtml = useMemo(() => {
    return markdownToHtml(content);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false,
      }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: placeholder || 'Write your description...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline hover:text-primary/80',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      CodeBlock.configure({
        HTMLAttributes: {
          class: 'bg-muted rounded-md p-3 font-mono text-sm overflow-x-auto',
        },
      }),
    ],
    content: initialHtml,
    onUpdate: ({ editor }) => {
      if (isSyncing.current) return;
      
      // Convert HTML back to Markdown and emit
      const html = editor.getHTML();
      const markdown = htmlToMarkdown(html);
      onChange(markdown);
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

  // Handle clicking on inline buttons in the editor
  useEffect(() => {
    const handleEditorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const buttonEl = target.closest('.editable-inline-button');
      
      if (buttonEl) {
        e.preventDefault();
        e.stopPropagation();
        
        const dataAttr = buttonEl.getAttribute('data-inline-button');
        if (dataAttr) {
          const data = parseInlineButtonFromDataAttr(dataAttr);
          if (data) {
            setEditingButtonData(data);
            setEditingButtonElement(buttonEl as HTMLElement);
            setShowInlineButtonEditor(true);
          }
        }
      }
    };
    
    const container = editorContainerRef.current;
    if (container) {
      container.addEventListener('click', handleEditorClick);
      return () => container.removeEventListener('click', handleEditorClick);
    }
  }, []);

  // Sync external content changes (e.g., when card changes)
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentHtml = editor.getHTML();
      const currentMarkdown = htmlToMarkdown(currentHtml);
      
      // Only update if content actually changed
      if (currentMarkdown !== content) {
        isSyncing.current = true;
        const newHtml = markdownToHtml(content);
        editor.commands.setContent(newHtml, { emitUpdate: false });
        isSyncing.current = false;
      }
    }
  }, [content, editor]);

  const handleInsertInlineButton = useCallback((data: InlineButtonData) => {
    if (!editor) return;
    
    const html = serializeInlineButtonHtml(data);
    
    if (editingButtonElement) {
      // Replace existing button
      editingButtonElement.outerHTML = html;
      // Trigger update by getting and re-setting content
      const updatedHtml = editor.getHTML();
      onChange(htmlToMarkdown(updatedHtml));
    } else {
      // Insert new button at cursor
      editor.chain().focus().insertContent(html + '&nbsp;').run();
    }
    
    setEditingButtonData(null);
    setEditingButtonElement(null);
  }, [editor, editingButtonElement, onChange]);

  const handleDeleteInlineButton = useCallback(() => {
    if (editingButtonElement && editor) {
      editingButtonElement.remove();
      const updatedHtml = editor.getHTML();
      onChange(htmlToMarkdown(updatedHtml));
    }
    setShowInlineButtonEditor(false);
    setEditingButtonData(null);
    setEditingButtonElement(null);
  }, [editingButtonElement, editor, onChange]);

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

  const handleInsertTable = () => {
    // Insert a simple markdown table template
    const tableHtml = `
      <table>
        <thead>
          <tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr>
        </thead>
        <tbody>
          <tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>
        </tbody>
      </table>
    `;
    editor.chain().focus().insertContent(tableHtml).run();
  };

  const handleInsertTaskList = () => {
    // Insert task list items
    editor.chain().focus().insertContent(`
      <ul>
        <li>[ ] Task item 1</li>
        <li>[ ] Task item 2</li>
      </ul>
    `).run();
  };

  return (
    <div ref={editorContainerRef} className={cn('border rounded-lg bg-background relative', className)}>
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
        <ToolbarButton
          onClick={handleInsertTaskList}
          title="Task List"
        >
          <CheckSquare className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Quote, Code, Table & Divider */}
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
          onClick={handleInsertTable}
          title="Insert Table"
        >
          <Table className="h-4 w-4" />
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
              className={cn('h-8 w-8 p-0', editor.isActive('link') && 'bg-muted text-primary')}
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

        {/* Inline Button */}
        <ToolbarButton
          onClick={() => {
            setEditingButtonData(null);
            setEditingButtonElement(null);
            setShowInlineButtonEditor(true);
          }}
          title="Insert Inline Button"
        >
          <SquareArrowOutUpRight className="h-4 w-4" />
        </ToolbarButton>

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
                        'h-6 w-6 rounded border hover:scale-110 transition-transform',
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

      {/* Editor Content - WYSIWYG view */}
      <EditorContent editor={editor} />

      {/* Inline Button Editor Dialog */}
      <InlineButtonEditor
        open={showInlineButtonEditor}
        onOpenChange={setShowInlineButtonEditor}
        data={editingButtonData}
        onSave={handleInsertInlineButton}
        onDelete={editingButtonElement ? handleDeleteInlineButton : undefined}
      />

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
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5rem 0;
        }
        .ProseMirror th, .ProseMirror td {
          border: 1px solid hsl(var(--border));
          padding: 0.5rem;
          text-align: left;
        }
        .ProseMirror th {
          background: hsl(var(--muted) / 0.5);
          font-weight: 600;
        }
        /* Editable inline button styling in editor */
        .ProseMirror .editable-inline-button {
          display: inline-flex !important;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid #3d444d;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          transition: opacity 0.15s ease;
          vertical-align: middle;
          position: relative;
        }
        .ProseMirror .editable-inline-button:hover {
          opacity: 0.85;
        }
        .ProseMirror .editable-inline-button img {
          flex-shrink: 0;
          object-fit: contain;
        }
        .ProseMirror .editable-inline-button .inline-button-text {
          text-decoration: none !important;
          white-space: nowrap;
          line-height: 1.4;
        }
        .ProseMirror .editable-inline-button::after {
          content: "";
          position: absolute;
          inset: -2px;
          border: 2px dashed hsl(var(--primary) / 0.5);
          border-radius: 6px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .ProseMirror .editable-inline-button:hover::after {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

export default MarkdownEditor;

// Export utility for inline button markdown serialization
export { serializeInlineButtonHtml as serializeInlineButtonMarkdown };
