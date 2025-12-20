/**
 * ToastUIMarkdownEditor.tsx
 * 
 * A WYSIWYG Markdown editor using Toast UI Editor.
 * Stores inline buttons as [INLINE_BUTTON:base64] in markdown,
 * displays them as styled text placeholders in the editor.
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

const INLINE_BUTTON_MARKDOWN_REGEX = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g;

/**
 * Create a text placeholder for an inline button in the editor
 * Using a simple format that Toast UI won't sanitize: 【ButtonText】
 */
function createButtonPlaceholder(data: InlineButtonData): string {
  return `【${data.linkText || 'Button'}】`;
}

/**
 * Extract button data from content and create a map of placeholder -> data
 */
function extractButtons(content: string): Map<string, InlineButtonData> {
  const buttons = new Map<string, InlineButtonData>();
  if (!content) return buttons;
  
  let match;
  INLINE_BUTTON_MARKDOWN_REGEX.lastIndex = 0;
  
  while ((match = INLINE_BUTTON_MARKDOWN_REGEX.exec(content)) !== null) {
    const data = parseInlineButtonFromDataAttr(match[1]);
    if (data) {
      const placeholder = createButtonPlaceholder(data);
      buttons.set(placeholder, data);
    }
  }
  
  return buttons;
}

/**
 * Convert content with [INLINE_BUTTON:...] to editor format with placeholders
 */
function contentToEditorFormat(content: string): string {
  if (!content) return '';
  
  return content.replace(INLINE_BUTTON_MARKDOWN_REGEX, (_match, encodedData) => {
    const data = parseInlineButtonFromDataAttr(encodedData);
    if (data) {
      return createButtonPlaceholder(data);
    }
    return '';
  });
}

/**
 * Convert editor content back to storage format, restoring button markers
 */
function editorToContentFormat(editorContent: string, buttonMap: Map<string, InlineButtonData>): string {
  if (!editorContent) return '';
  
  let result = editorContent;
  
  // Restore button placeholders to [INLINE_BUTTON:...] format
  for (const [placeholder, data] of buttonMap) {
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    // Escape special regex chars in placeholder
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escapedPlaceholder, 'g'), `[INLINE_BUTTON:${encodedData}]`);
  }
  
  return result;
}

export function ToastUIMarkdownEditor({
  content,
  onChange,
  placeholder,
  className,
}: ToastUIMarkdownEditorProps) {
  const editorRef = useRef<Editor>(null);
  const [showButtonEditor, setShowButtonEditor] = useState(false);
  const [editingButton, setEditingButton] = useState<InlineButtonData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const isInitialized = useRef(false);
  const lastContentRef = useRef(content);
  const buttonMapRef = useRef<Map<string, InlineButtonData>>(new Map());
  
  // Parse buttons from content
  const buttons = useMemo(() => {
    const map = extractButtons(content);
    buttonMapRef.current = map;
    return Array.from(map.entries()).map(([placeholder, data]) => ({ placeholder, data }));
  }, [content]);
  
  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const markdown = editor.getMarkdown();
    const converted = editorToContentFormat(markdown, buttonMapRef.current);
    
    if (converted !== lastContentRef.current) {
      lastContentRef.current = converted;
      onChange(converted);
    }
  }, [onChange]);
  
  // Initialize editor
  useEffect(() => {
    const editor = editorRef.current?.getInstance();
    if (!editor || isInitialized.current) return;
    
    const timeoutId = setTimeout(() => {
      const editorContent = contentToEditorFormat(content);
      isSyncing.current = true;
      editor.setMarkdown(editorContent);
      isSyncing.current = false;
      lastContentRef.current = content;
      isInitialized.current = true;
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [content]);
  
  // Sync external content changes
  useEffect(() => {
    if (!isInitialized.current || content === lastContentRef.current) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    isSyncing.current = true;
    editor.setMarkdown(contentToEditorFormat(content));
    lastContentRef.current = content;
    isSyncing.current = false;
  }, [content]);
  
  const handleSaveButton = useCallback((data: InlineButtonData) => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const placeholder = createButtonPlaceholder(data);
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    
    if (editingButton) {
      // Replace existing button in content
      const oldPlaceholder = createButtonPlaceholder(editingButton);
      let markdown = editor.getMarkdown();
      const escapedOld = oldPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      markdown = markdown.replace(new RegExp(escapedOld, 'g'), placeholder);
      editor.setMarkdown(markdown);
      
      // Update button map
      buttonMapRef.current.delete(oldPlaceholder);
      buttonMapRef.current.set(placeholder, data);
    } else {
      // Insert new button at cursor
      editor.insertText(placeholder);
      buttonMapRef.current.set(placeholder, data);
    }
    
    setEditingButton(null);
    setTimeout(handleChange, 10);
  }, [editingButton, handleChange]);
  
  const handleDeleteButton = useCallback(() => {
    if (!editingButton) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const placeholder = createButtonPlaceholder(editingButton);
    let markdown = editor.getMarkdown();
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    markdown = markdown.replace(new RegExp(escapedPlaceholder, 'g'), '');
    editor.setMarkdown(markdown);
    
    buttonMapRef.current.delete(placeholder);
    
    setShowButtonEditor(false);
    setEditingButton(null);
    handleChange();
  }, [editingButton, handleChange]);
  
  const handleAddButton = useCallback(() => {
    setEditingButton(null);
    setShowButtonEditor(true);
  }, []);
  
  const handleEditButton = useCallback((data: InlineButtonData) => {
    setEditingButton(data);
    setShowButtonEditor(true);
  }, []);
  
  const toolbarButton = useCallback(() => {
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px 8px;font-size:11px;font-weight:600;min-width:28px;height:28px;border-radius:4px;';
    btn.innerHTML = 'inb';
    btn.title = 'Insert Inline Button';
    btn.type = 'button';
    btn.onclick = (e) => { e.preventDefault(); handleAddButton(); };
    return btn;
  }, [handleAddButton]);

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
          [{ el: toolbarButton(), tooltip: 'Insert Inline Button', name: 'inlineButton' }],
        ]}
      />
      
      {/* Button chips for editing - shown below editor when buttons exist */}
      {buttons.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/30 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Click to edit:</span>
          {buttons.map((btn, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleEditButton(btn.data)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer transition-all hover:opacity-80 hover:ring-2 hover:ring-primary/40"
              style={{
                backgroundColor: btn.data.backgroundColor || '#1D2125',
                border: '1px solid #3d444d',
              }}
            >
              {btn.data.iconUrl && (
                <img
                  src={btn.data.iconUrl}
                  alt=""
                  style={{ width: btn.data.iconSize || 16, height: btn.data.iconSize || 16 }}
                  className="object-contain"
                />
              )}
              <span style={{ color: btn.data.textColor || '#579DFF' }}>
                {btn.data.linkText || 'Button'}
              </span>
            </button>
          ))}
        </div>
      )}
      
      <InlineButtonEditor
        open={showButtonEditor}
        onOpenChange={setShowButtonEditor}
        onSave={handleSaveButton}
        onDelete={editingButton ? handleDeleteButton : undefined}
        data={editingButton}
      />
      
      <style>{`
        .toastui-editor-wrapper .toastui-editor-contents {
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
