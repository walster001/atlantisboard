/**
 * ToastUIMarkdownEditor.tsx
 * 
 * A WYSIWYG Markdown editor using Toast UI Editor.
 * Uses Toast UI's widgetRules to render inline buttons as custom widgets.
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

// Match [INLINE_BUTTON:base64data] format
const INLINE_BUTTON_REGEX = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g;
const INLINE_BUTTON_WIDGET_RULE = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/;

/**
 * Create the widget DOM element for an inline button
 */
function createButtonWidget(encodedData: string): HTMLElement {
  const data = parseInlineButtonFromDataAttr(encodedData);
  
  const wrapper = document.createElement('span');
  wrapper.className = 'inline-button-widget';
  wrapper.setAttribute('data-btn', encodedData);
  wrapper.contentEditable = 'false';
  wrapper.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    margin: 0 2px;
    border-radius: 4px;
    background: ${data?.backgroundColor || '#1D2125'};
    border: 1px solid #3d444d;
    cursor: pointer;
    vertical-align: middle;
    user-select: none;
    font-size: 14px;
    line-height: 1.4;
  `;
  
  if (data?.iconUrl) {
    const img = document.createElement('img');
    img.src = data.iconUrl;
    img.alt = '';
    img.style.cssText = `
      width: ${data.iconSize || 16}px;
      height: ${data.iconSize || 16}px;
      object-fit: contain;
      pointer-events: none;
    `;
    wrapper.appendChild(img);
  }
  
  const text = document.createElement('span');
  text.textContent = data?.linkText || 'Button';
  text.style.cssText = `
    color: ${data?.textColor || '#579DFF'};
    pointer-events: none;
    white-space: nowrap;
  `;
  wrapper.appendChild(text);
  
  return wrapper;
}

/**
 * Widget rules for Toast UI Editor
 */
const widgetRules = [
  {
    rule: INLINE_BUTTON_WIDGET_RULE,
    toDOM(text: string) {
      const match = text.match(INLINE_BUTTON_WIDGET_RULE);
      if (match) {
        return createButtonWidget(match[1]);
      }
      const span = document.createElement('span');
      span.textContent = text;
      return span;
    },
  },
];

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
  
  // Extract buttons from content for the chip display
  const buttons = useMemo(() => {
    const result: InlineButtonData[] = [];
    if (!content) return result;
    
    let match;
    INLINE_BUTTON_REGEX.lastIndex = 0;
    while ((match = INLINE_BUTTON_REGEX.exec(content)) !== null) {
      const data = parseInlineButtonFromDataAttr(match[1]);
      if (data) result.push(data);
    }
    return result;
  }, [content]);
  
  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const markdown = editor.getMarkdown();
    
    if (markdown !== lastContentRef.current) {
      lastContentRef.current = markdown;
      onChange(markdown);
    }
  }, [onChange]);
  
  // Initialize editor
  useEffect(() => {
    const editor = editorRef.current?.getInstance();
    if (!editor || isInitialized.current) return;
    
    const timeoutId = setTimeout(() => {
      isSyncing.current = true;
      editor.setMarkdown(content || '');
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
    editor.setMarkdown(content || '');
    lastContentRef.current = content;
    isSyncing.current = false;
  }, [content]);
  
  // Handle clicks on inline button widgets
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const widget = target.closest('.inline-button-widget') as HTMLElement;
      
      if (widget) {
        e.preventDefault();
        e.stopPropagation();
        
        const encodedData = widget.getAttribute('data-btn');
        if (encodedData) {
          const data = parseInlineButtonFromDataAttr(encodedData);
          if (data) {
            setEditingButton(data);
            setShowButtonEditor(true);
          }
        }
      }
    };
    
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, []);
  
  const handleSaveButton = useCallback((data: InlineButtonData) => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const buttonMarkdown = `[INLINE_BUTTON:${encodedData}]`;
    
    if (editingButton) {
      // Replace existing button
      const oldEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(editingButton))));
      let markdown = editor.getMarkdown();
      markdown = markdown.replace(`[INLINE_BUTTON:${oldEncoded}]`, buttonMarkdown);
      editor.setMarkdown(markdown);
    } else {
      // Insert new button at cursor
      editor.insertText(buttonMarkdown);
    }
    
    setEditingButton(null);
    setTimeout(handleChange, 10);
  }, [editingButton, handleChange]);
  
  const handleDeleteButton = useCallback(() => {
    if (!editingButton) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(editingButton))));
    let markdown = editor.getMarkdown();
    markdown = markdown.replace(`[INLINE_BUTTON:${encodedData}]`, '');
    editor.setMarkdown(markdown);
    
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
        widgetRules={widgetRules}
        toolbarItems={[
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'link'],
          ['code', 'codeblock'],
          [{ el: toolbarButton(), tooltip: 'Insert Inline Button', name: 'inlineButton' }],
        ]}
      />
      
      {/* Button chips for quick editing */}
      {buttons.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/30 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Buttons:</span>
          {buttons.map((btn, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleEditButton(btn)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer transition-all hover:ring-2 hover:ring-primary/40"
              style={{
                backgroundColor: btn.backgroundColor || '#1D2125',
                border: '1px solid #3d444d',
              }}
            >
              {btn.iconUrl && (
                <img
                  src={btn.iconUrl}
                  alt=""
                  style={{ width: btn.iconSize || 16, height: btn.iconSize || 16 }}
                  className="object-contain"
                />
              )}
              <span style={{ color: btn.textColor || '#579DFF' }}>
                {btn.linkText || 'Button'}
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
        .toastui-editor-wrapper .inline-button-widget {
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .toastui-editor-wrapper .inline-button-widget:hover {
          box-shadow: 0 0 0 2px rgba(87, 157, 255, 0.4);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
