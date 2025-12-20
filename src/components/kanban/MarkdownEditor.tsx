/**
 * MarkdownEditor.tsx
 * 
 * A secure Markdown editor with a toolbar for inserting Markdown formatting.
 * 
 * Features:
 * - Toolbar buttons to insert Markdown syntax (bold, italic, headings, lists, etc.)
 * - Inline button creator integration with floating form
 * - Real-time preview using MarkdownRenderer
 * - Undo/redo support via browser native textarea behavior
 * - Emoji shortcode support in preview (e.g., :smile: → 😄)
 * - GFM support for tables, task lists, strikethrough
 * 
 * The editor works with raw Markdown text and stores Markdown in the database,
 * not HTML. This is more secure and portable.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Link as LinkIcon,
  Code,
  CheckSquare,
  Table,
  SquareArrowOutUpRight,
  Eye,
  Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { InlineButtonEditor, InlineButtonData } from './InlineButtonEditor';
import { MarkdownRenderer } from './MarkdownRenderer';

// ============================================================================
// Types
// ============================================================================

interface MarkdownEditorProps {
  /** Current markdown content */
  content: string;
  /** Called when content changes */
  onChange: (content: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Auto-size textarea height */
  autoSize?: boolean;
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
// Inline Button Serialization for Markdown
// ============================================================================

/**
 * Serialize an inline button to our custom Markdown format.
 * Format: [INLINE_BUTTON:base64EncodedData]
 */
export function serializeInlineButtonMarkdown(data: InlineButtonData): string {
  const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return `[INLINE_BUTTON:${encodedData}]`;
}

// ============================================================================
// Text Manipulation Utilities
// ============================================================================

interface TextSelection {
  start: number;
  end: number;
  text: string;
}

/**
 * Get current selection from textarea.
 */
function getSelection(textarea: HTMLTextAreaElement): TextSelection {
  return {
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
    text: textarea.value.substring(textarea.selectionStart, textarea.selectionEnd),
  };
}

/**
 * Insert text at cursor position, optionally wrapping selection.
 */
function insertAtCursor(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string = '',
  value: string,
  onChange: (v: string) => void
) {
  const selection = getSelection(textarea);
  const selectedText = selection.text || 'text';
  
  const newText = 
    value.substring(0, selection.start) +
    before +
    selectedText +
    after +
    value.substring(selection.end);
  
  onChange(newText);
  
  // Restore focus and set cursor position after update
  setTimeout(() => {
    textarea.focus();
    const newCursorPos = selection.start + before.length + selectedText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }, 0);
}

/**
 * Insert text at start of each selected line.
 */
function insertAtLineStart(
  textarea: HTMLTextAreaElement,
  prefix: string,
  value: string,
  onChange: (v: string) => void
) {
  const selection = getSelection(textarea);
  
  // Find start of first selected line
  let lineStart = selection.start;
  while (lineStart > 0 && value[lineStart - 1] !== '\n') {
    lineStart--;
  }
  
  // Find end of last selected line
  let lineEnd = selection.end;
  while (lineEnd < value.length && value[lineEnd] !== '\n') {
    lineEnd++;
  }
  
  // Get the selected lines
  const lines = value.substring(lineStart, lineEnd).split('\n');
  
  // Add prefix to each line
  const newLines = lines.map(line => prefix + line);
  
  const newText = 
    value.substring(0, lineStart) +
    newLines.join('\n') +
    value.substring(lineEnd);
  
  onChange(newText);
  
  // Restore focus
  setTimeout(() => {
    textarea.focus();
  }, 0);
}

// ============================================================================
// Main Editor Component
// ============================================================================

export function MarkdownEditor({
  content,
  onChange,
  placeholder = 'Write your description in Markdown...',
  className,
  autoSize = false,
}: MarkdownEditorProps) {
  // State for link popover
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  
  // State for inline button editor
  const [showInlineButtonEditor, setShowInlineButtonEditor] = useState(false);
  
  // State for preview mode
  const [showPreview, setShowPreview] = useState(false);
  
  // Textarea ref for cursor manipulation
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ============================================================================
  // Formatting Handlers
  // ============================================================================

  /**
   * Toggle bold formatting: **text**
   */
  const handleBold = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtCursor(textareaRef.current, '**', '**', content, onChange);
  }, [content, onChange]);

  /**
   * Toggle italic formatting: *text*
   */
  const handleItalic = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtCursor(textareaRef.current, '*', '*', content, onChange);
  }, [content, onChange]);

  /**
   * Toggle strikethrough formatting: ~~text~~
   */
  const handleStrikethrough = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtCursor(textareaRef.current, '~~', '~~', content, onChange);
  }, [content, onChange]);

  /**
   * Insert heading: # text
   */
  const handleHeading = useCallback((level: 1 | 2 | 3) => {
    if (!textareaRef.current) return;
    const prefix = '#'.repeat(level) + ' ';
    insertAtLineStart(textareaRef.current, prefix, content, onChange);
  }, [content, onChange]);

  /**
   * Insert bullet list item: - text
   */
  const handleBulletList = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtLineStart(textareaRef.current, '- ', content, onChange);
  }, [content, onChange]);

  /**
   * Insert numbered list item: 1. text
   */
  const handleNumberedList = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtLineStart(textareaRef.current, '1. ', content, onChange);
  }, [content, onChange]);

  /**
   * Insert task list item: - [ ] text
   */
  const handleTaskList = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtLineStart(textareaRef.current, '- [ ] ', content, onChange);
  }, [content, onChange]);

  /**
   * Insert blockquote: > text
   */
  const handleBlockquote = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtLineStart(textareaRef.current, '> ', content, onChange);
  }, [content, onChange]);

  /**
   * Insert code block: ```code```
   */
  const handleCodeBlock = useCallback(() => {
    if (!textareaRef.current) return;
    insertAtCursor(textareaRef.current, '\n```\n', '\n```\n', content, onChange);
  }, [content, onChange]);

  /**
   * Insert horizontal rule: ---
   */
  const handleHorizontalRule = useCallback(() => {
    if (!textareaRef.current) return;
    const selection = getSelection(textareaRef.current);
    const newText = 
      content.substring(0, selection.start) +
      '\n---\n' +
      content.substring(selection.end);
    onChange(newText);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [content, onChange]);

  /**
   * Insert table template
   */
  const handleTable = useCallback(() => {
    if (!textareaRef.current) return;
    const tableTemplate = '\n| Header 1 | Header 2 | Header 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n';
    const selection = getSelection(textareaRef.current);
    const newText = 
      content.substring(0, selection.start) +
      tableTemplate +
      content.substring(selection.end);
    onChange(newText);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [content, onChange]);

  /**
   * Insert link: [text](url)
   */
  const handleInsertLink = useCallback(() => {
    if (!textareaRef.current) return;
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    const text = linkText || 'link';
    const linkMarkdown = `[${text}](${url})`;
    
    const selection = getSelection(textareaRef.current);
    const newText = 
      content.substring(0, selection.start) +
      linkMarkdown +
      content.substring(selection.end);
    
    onChange(newText);
    setLinkUrl('');
    setLinkText('');
    setShowLinkPopover(false);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [content, onChange, linkUrl, linkText]);

  /**
   * Insert inline button
   */
  const handleInsertInlineButton = useCallback((data: InlineButtonData) => {
    if (!textareaRef.current) return;
    
    const buttonMarkdown = serializeInlineButtonMarkdown(data);
    const selection = getSelection(textareaRef.current);
    const newText = 
      content.substring(0, selection.start) +
      buttonMarkdown + ' ' +
      content.substring(selection.end);
    
    onChange(newText);
    setShowInlineButtonEditor(false);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [content, onChange]);

  // ============================================================================
  // Auto-resize Textarea
  // ============================================================================

  useEffect(() => {
    if (autoSize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content, autoSize]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn('border rounded-lg bg-background', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1 border-b bg-muted/30">
        {/* Text formatting */}
        <ToolbarButton onClick={handleBold} title="Bold (Ctrl+B)">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleItalic} title="Italic (Ctrl+I)">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleStrikethrough} title="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Headings */}
        <ToolbarButton onClick={() => handleHeading(1)} title="Heading 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => handleHeading(2)} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => handleHeading(3)} title="Heading 3">
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Lists */}
        <ToolbarButton onClick={handleBulletList} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleNumberedList} title="Numbered List">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleTaskList} title="Task List">
          <CheckSquare className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Quote, Code, Table & Divider */}
        <ToolbarButton onClick={handleBlockquote} title="Quote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleCodeBlock} title="Code Block">
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleTable} title="Insert Table">
          <Table className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleHorizontalRule} title="Horizontal Rule">
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
              className="h-8 w-8 p-0"
              title="Add Link"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium">Link Text</Label>
                <Input
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Display text"
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">URL</Label>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="h-8 text-sm mt-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleInsertLink()}
                />
              </div>
              <Button size="sm" onClick={handleInsertLink} className="w-full">
                Insert Link
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Inline Button */}
        <ToolbarButton
          onClick={() => setShowInlineButtonEditor(true)}
          title="Insert Inline Button"
        >
          <SquareArrowOutUpRight className="h-4 w-4" />
        </ToolbarButton>

        <div className="flex-1" />

        {/* Preview Toggle */}
        <ToolbarButton
          onClick={() => setShowPreview(!showPreview)}
          isActive={showPreview}
          title={showPreview ? 'Edit' : 'Preview'}
        >
          {showPreview ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </ToolbarButton>
      </div>

      {/* Editor Content / Preview */}
      {showPreview ? (
        <div className="p-3 min-h-[120px] prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={content} />
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'border-0 rounded-none rounded-b-lg focus-visible:ring-0 resize-none',
            autoSize ? 'min-h-[80px]' : 'min-h-[120px]'
          )}
        />
      )}

      {/* Inline Button Editor Dialog */}
      <InlineButtonEditor
        open={showInlineButtonEditor}
        onOpenChange={setShowInlineButtonEditor}
        data={null}
        onSave={handleInsertInlineButton}
      />
    </div>
  );
}

export default MarkdownEditor;
