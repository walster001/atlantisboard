/**
 * ToastUIMarkdownEditor.tsx
 * 
 * A WYSIWYG Markdown editor using Toast UI Editor.
 * Uses Toast UI's widgetRules to render inline buttons as custom widgets.
 * Buttons can be clicked directly in the editor to edit them.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
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
const INLINE_BUTTON_WIDGET_RULE = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/;

const DEFAULT_BORDER_RADIUS = 4;

/**
 * Create the widget DOM element for an inline button.
 * This is called by Toast UI's widgetRules when it encounters the pattern.
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
    border-radius: ${data?.borderRadius ?? DEFAULT_BORDER_RADIUS}px;
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
    img.draggable = false;
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
 * Widget rules for Toast UI Editor - renders [INLINE_BUTTON:...] as styled buttons
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
  const [editingEncodedData, setEditingEncodedData] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const isInitialized = useRef(false);
  const lastContentRef = useRef(content);
  
  /**
   * Strip Toast UI's internal widget markers from markdown content.
   * Toast UI wraps widgets with $$widget[n] ... $$ markers that we need to remove.
   */
  const cleanWidgetMarkers = useCallback((text: string): string => {
    // Remove $$widget[n] prefix markers
    let cleaned = text.replace(/\$\$widget\d+\s*/g, '');
    // Remove trailing $$ markers that aren't part of our button format
    cleaned = cleaned.replace(/\$\$(?!\[INLINE_BUTTON)/g, '');
    // Clean up any orphaned $$ markers
    cleaned = cleaned.replace(/\s*\$\$\s*$/gm, '');
    return cleaned;
  }, []);

  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    let markdown = editor.getMarkdown();
    // Clean widget markers before saving
    markdown = cleanWidgetMarkers(markdown);
    
    if (markdown !== lastContentRef.current) {
      lastContentRef.current = markdown;
      onChange(markdown);
    }
  }, [onChange, cleanWidgetMarkers]);
  
  // Initialize editor with content
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
  
  // Handle clicks on inline button widgets - edit in place
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
            setEditingEncodedData(encodedData);
            setShowButtonEditor(true);
          }
        }
      }
    };
    
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, []);
  
  // Save button (new or edited)
  const handleSaveButton = useCallback((data: InlineButtonData) => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const newEncodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const newButtonMarkdown = `[INLINE_BUTTON:${newEncodedData}]`;
    
    if (editingEncodedData) {
      // Replace existing button using the original encoded data
      let markdown = editor.getMarkdown();
      const oldMarker = `[INLINE_BUTTON:${editingEncodedData}]`;
      markdown = markdown.replace(oldMarker, newButtonMarkdown);
      editor.setMarkdown(markdown);
    } else {
      // Insert new button at cursor
      editor.insertText(newButtonMarkdown);
    }
    
    setEditingButton(null);
    setEditingEncodedData(null);
    setTimeout(handleChange, 10);
  }, [editingEncodedData, handleChange]);
  
  // Delete button
  const handleDeleteButton = useCallback(() => {
    if (!editingEncodedData) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    let markdown = editor.getMarkdown();
    const marker = `[INLINE_BUTTON:${editingEncodedData}]`;
    markdown = markdown.replace(marker, '');
    editor.setMarkdown(markdown);
    
    setShowButtonEditor(false);
    setEditingButton(null);
    setEditingEncodedData(null);
    handleChange();
  }, [editingEncodedData, handleChange]);
  
  // Add new button
  const handleAddButton = useCallback(() => {
    setEditingButton(null);
    setEditingEncodedData(null);
    setShowButtonEditor(true);
  }, []);
  
  // Create toolbar button for inserting new buttons
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
    <div ref={containerRef} className={cn('border rounded-lg bg-background relative toastui-editor-wrapper flex flex-col', className)}>
      <Editor
        ref={editorRef}
        initialValue=""
        initialEditType="wysiwyg"
        previewStyle="vertical"
        height="auto"
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
      
      <InlineButtonEditor
        open={showButtonEditor}
        onOpenChange={setShowButtonEditor}
        onSave={handleSaveButton}
        onDelete={editingEncodedData ? handleDeleteButton : undefined}
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
        .toastui-editor-wrapper .toastui-editor-defaultUI {
          display: flex;
          flex-direction: column;
          min-height: 150px;
        }
        .toastui-editor-wrapper .toastui-editor-defaultUI-toolbar {
          flex-shrink: 0;
        }
        .toastui-editor-wrapper .toastui-editor-main-container {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .toastui-editor-wrapper .toastui-editor-ww-container {
          height: 100%;
        }
        .toastui-editor-wrapper .toastui-editor-ww-mode .ProseMirror {
          min-height: 100px;
          max-height: calc(100vh - 400px);
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}
