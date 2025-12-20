/**
 * ToastUIMarkdownEditor.tsx
 * 
 * A WYSIWYG Markdown editor using Toast UI Editor.
 * Handles markdown content and inline buttons using placeholder tokens
 * that are rendered as React components outside the editor.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Editor } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import { cn } from '@/lib/utils';
import { InlineButtonEditor, InlineButtonData, parseInlineButtonFromDataAttr } from './InlineButtonEditor';

interface ToastUIMarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
}

// Placeholder format: ⟦BTN:base64data⟧
// Using Unicode brackets to avoid conflicts with markdown
const BUTTON_PLACEHOLDER_REGEX = /⟦BTN:([A-Za-z0-9+/=]+)⟧/g;
const INLINE_BUTTON_MARKDOWN_REGEX = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g;

/**
 * Convert [INLINE_BUTTON:...] format to display placeholder for editor
 */
function contentToEditorFormat(content: string): string {
  if (!content) return '';
  
  // Convert [INLINE_BUTTON:data] to ⟦BTN:data⟧ placeholder
  return content.replace(INLINE_BUTTON_MARKDOWN_REGEX, (_match, data) => {
    return `⟦BTN:${data}⟧`;
  });
}

/**
 * Convert editor placeholder format back to storage format
 */
function editorFormatToContent(editorContent: string): string {
  if (!editorContent) return '';
  
  // Convert ⟦BTN:data⟧ back to [INLINE_BUTTON:data]
  return editorContent.replace(BUTTON_PLACEHOLDER_REGEX, (_match, data) => {
    return `[INLINE_BUTTON:${data}]`;
  });
}

/**
 * Create a new inline button placeholder
 */
function createButtonPlaceholder(data: InlineButtonData): string {
  const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return `⟦BTN:${encodedData}⟧`;
}

/**
 * Inline Button Component for rendering in the overlay
 */
interface InlineButtonDisplayProps {
  data: InlineButtonData;
  onClick: () => void;
}

function InlineButtonDisplay({ data, onClick }: InlineButtonDisplayProps) {
  return (
    <span
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="inline-button-display"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: data.backgroundColor || '#1D2125',
        border: '1px solid #3d444d',
        cursor: 'pointer',
        verticalAlign: 'middle',
        fontSize: '14px',
        lineHeight: '1.4',
      }}
    >
      {data.iconUrl && (
        <img
          src={data.iconUrl}
          alt=""
          style={{
            width: data.iconSize || 16,
            height: data.iconSize || 16,
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ color: data.textColor || '#579DFF', whiteSpace: 'nowrap' }}>
        {data.linkText || 'Button'}
      </span>
    </span>
  );
}

export function ToastUIMarkdownEditor({
  content,
  onChange,
  placeholder,
  className,
}: ToastUIMarkdownEditorProps) {
  const editorRef = useRef<Editor>(null);
  const [showInlineButtonEditor, setShowInlineButtonEditor] = useState(false);
  const [editingButtonData, setEditingButtonData] = useState<InlineButtonData | null>(null);
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const isInitialized = useRef(false);
  const lastContentRef = useRef(content);
  
  // Parse buttons from content for overlay rendering
  const buttonData = useMemo(() => {
    const buttons: Array<{ data: InlineButtonData; index: number }> = [];
    let match;
    INLINE_BUTTON_MARKDOWN_REGEX.lastIndex = 0;
    let index = 0;
    
    while ((match = INLINE_BUTTON_MARKDOWN_REGEX.exec(content)) !== null) {
      const parsed = parseInlineButtonFromDataAttr(match[1]);
      if (parsed) {
        buttons.push({ data: parsed, index });
      }
      index++;
    }
    
    return buttons;
  }, [content]);
  
  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    // Get markdown from editor
    const markdown = editorInstance.getMarkdown();
    const converted = editorFormatToContent(markdown);
    
    // Only trigger onChange if content actually changed
    if (converted !== lastContentRef.current) {
      lastContentRef.current = converted;
      onChange(converted);
    }
  }, [onChange]);
  
  // Initialize editor with content after mount
  useEffect(() => {
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance || isInitialized.current) return;
    
    // Small delay to ensure editor is fully mounted
    const timeoutId = setTimeout(() => {
      const editorContent = contentToEditorFormat(content);
      if (editorContent) {
        isSyncing.current = true;
        editorInstance.setMarkdown(editorContent);
        isSyncing.current = false;
      }
      lastContentRef.current = content;
      isInitialized.current = true;
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [content]);
  
  // Sync external content changes
  useEffect(() => {
    if (!isInitialized.current) return;
    if (content === lastContentRef.current) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    isSyncing.current = true;
    const editorContent = contentToEditorFormat(content);
    editorInstance.setMarkdown(editorContent);
    lastContentRef.current = content;
    isSyncing.current = false;
  }, [content]);
  
  const handleInsertInlineButton = useCallback((data: InlineButtonData) => {
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    const buttonPlaceholder = createButtonPlaceholder(data);
    
    if (editingButtonData && editingButtonIndex !== null) {
      // Replace existing button
      let currentMarkdown = editorInstance.getMarkdown();
      let buttonCount = 0;
      
      currentMarkdown = currentMarkdown.replace(BUTTON_PLACEHOLDER_REGEX, (match) => {
        if (buttonCount === editingButtonIndex) {
          buttonCount++;
          return buttonPlaceholder;
        }
        buttonCount++;
        return match;
      });
      
      editorInstance.setMarkdown(currentMarkdown);
    } else {
      // Insert new button at cursor
      editorInstance.insertText(buttonPlaceholder);
    }
    
    setEditingButtonData(null);
    setEditingButtonIndex(null);
    
    // Trigger change after a small delay
    setTimeout(() => handleChange(), 10);
  }, [editingButtonData, editingButtonIndex, handleChange]);
  
  const handleDeleteInlineButton = useCallback(() => {
    if (editingButtonIndex === null) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    let currentMarkdown = editorInstance.getMarkdown();
    let buttonCount = 0;
    
    currentMarkdown = currentMarkdown.replace(BUTTON_PLACEHOLDER_REGEX, (match) => {
      if (buttonCount === editingButtonIndex) {
        buttonCount++;
        return ''; // Remove this button
      }
      buttonCount++;
      return match;
    });
    
    editorInstance.setMarkdown(currentMarkdown);
    
    setShowInlineButtonEditor(false);
    setEditingButtonData(null);
    setEditingButtonIndex(null);
    handleChange();
  }, [editingButtonIndex, handleChange]);
  
  const handleAddNewButton = useCallback(() => {
    setEditingButtonData(null);
    setEditingButtonIndex(null);
    setShowInlineButtonEditor(true);
  }, []);
  
  const handleEditButton = useCallback((buttonInfo: { data: InlineButtonData; index: number }) => {
    setEditingButtonData(buttonInfo.data);
    setEditingButtonIndex(buttonInfo.index);
    setShowInlineButtonEditor(true);
  }, []);
  
  // Create custom toolbar button
  const customToolbarButton = useCallback(() => {
    const button = document.createElement('button');
    button.className = 'toastui-editor-toolbar-icons';
    button.style.cssText = 'background: none; border: none; cursor: pointer; padding: 4px 8px; font-size: 11px; font-weight: 600; color: inherit; display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 4px;';
    button.innerHTML = 'inb';
    button.title = 'Insert Inline Button';
    button.type = 'button';
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAddNewButton();
    };
    return button;
  }, [handleAddNewButton]);

  return (
    <div ref={containerRef} className={cn('border rounded-lg bg-background relative toastui-editor-wrapper', className)}>
      <Editor
        ref={editorRef}
        initialValue=""
        initialEditType="wysiwyg"
        previewStyle="vertical"
        height="300px"
        usageStatistics={false}
        hideModeSwitch={true}
        placeholder={placeholder || 'Write your description...'}
        onChange={handleChange}
        toolbarItems={[
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'link'],
          ['code', 'codeblock'],
          [{
            el: customToolbarButton(),
            tooltip: 'Insert Inline Button',
            name: 'inlineButton',
          }],
        ]}
      />
      
      {/* Button Legend - shows all buttons in content for easy editing */}
      {buttonData.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/30 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground mr-1">Buttons:</span>
          {buttonData.map((btn) => (
            <InlineButtonDisplay
              key={btn.index}
              data={btn.data}
              onClick={() => handleEditButton(btn)}
            />
          ))}
        </div>
      )}
      
      {/* Inline Button Editor Dialog */}
      <InlineButtonEditor
        open={showInlineButtonEditor}
        onOpenChange={setShowInlineButtonEditor}
        onSave={handleInsertInlineButton}
        onDelete={editingButtonData ? handleDeleteInlineButton : undefined}
        data={editingButtonData}
      />
      
      {/* Custom styles for placeholders in the editor */}
      <style>{`
        /* Style the button placeholders in the editor to be more visible */
        .toastui-editor-wrapper .toastui-editor-contents,
        .toastui-editor-wrapper .ProseMirror {
          font-size: 14px;
        }
        
        /* Make placeholders stand out */
        .toastui-editor-wrapper .toastui-editor-contents:has(p),
        .toastui-editor-wrapper .ProseMirror p {
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
