/**
 * ToastUIMarkdownEditor.tsx
 * 
 * A WYSIWYG Markdown editor using Toast UI Editor.
 * Renders inline buttons as draggable HTML elements within the editor.
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

const INLINE_BUTTON_MARKDOWN_REGEX = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g;

/**
 * Create HTML for an inline button that renders properly in the editor
 */
function createButtonHtml(data: InlineButtonData, encodedData: string): string {
  const iconHtml = data.iconUrl 
    ? `<img src="${data.iconUrl}" alt="" draggable="false" style="width:${data.iconSize || 16}px;height:${data.iconSize || 16}px;object-fit:contain;vertical-align:middle;pointer-events:none;">` 
    : '';
  
  return `<span class="inline-btn" data-btn="${encodedData}" draggable="true" contenteditable="false" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;margin:0 2px;border-radius:4px;background:${data.backgroundColor || '#1D2125'};border:1px solid #3d444d;cursor:grab;vertical-align:middle;user-select:none;">${iconHtml}<span style="color:${data.textColor || '#579DFF'};pointer-events:none;">${data.linkText || 'Button'}</span></span>`;
}

/**
 * Convert markdown [INLINE_BUTTON:...] to HTML buttons for editor display
 */
function markdownToEditorHtml(markdown: string): string {
  if (!markdown) return '';
  
  return markdown.replace(INLINE_BUTTON_MARKDOWN_REGEX, (_match, encodedData) => {
    const data = parseInlineButtonFromDataAttr(encodedData);
    if (data) {
      return createButtonHtml(data, encodedData);
    }
    return '';
  });
}

/**
 * Convert editor HTML back to markdown format for storage
 */
function editorHtmlToMarkdown(html: string): string {
  if (!html) return '';
  
  let result = html;
  
  // Convert inline button spans back to markdown format
  result = result.replace(/<span[^>]*class="[^"]*inline-btn[^"]*"[^>]*data-btn="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, 
    (_match, encodedData) => `[INLINE_BUTTON:${encodedData}]`
  );
  
  // Convert basic HTML to markdown
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n');
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n');
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n');
  result = result.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n');
  result = result.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  result = result.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  result = result.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  result = result.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  result = result.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');
  result = result.replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~');
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  result = result.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  result = result.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  result = result.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  result = result.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n');
  result = result.replace(/<hr\s*\/?>/gi, '\n---\n');
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = result.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  result = result.replace(/<\/?p[^>]*>/gi, '');
  result = result.replace(/<\/?div[^>]*>/gi, '');
  result = result.replace(/<\/?span[^>]*>/gi, '');
  
  // Decode entities
  result = result.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  
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
  const dropIndicatorRef = useRef<HTMLDivElement | null>(null);
  const isSyncing = useRef(false);
  const isInitialized = useRef(false);
  const lastContentRef = useRef(content);
  const dragDataRef = useRef<string | null>(null);
  const dragSourceRef = useRef<HTMLElement | null>(null);
  
  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const html = editor.getHTML();
    const markdown = editorHtmlToMarkdown(html);
    
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
      const html = markdownToEditorHtml(content);
      isSyncing.current = true;
      editor.setHTML(html || '<p><br></p>');
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
    editor.setHTML(markdownToEditorHtml(content) || '<p><br></p>');
    lastContentRef.current = content;
    isSyncing.current = false;
  }, [content]);
  
  // Create/show drop indicator
  const showDropIndicator = useCallback((x: number, y: number) => {
    if (!dropIndicatorRef.current) {
      const indicator = document.createElement('div');
      indicator.className = 'drop-indicator';
      indicator.style.cssText = `
        position: fixed;
        width: 2px;
        height: 20px;
        background: #579DFF;
        border-radius: 1px;
        pointer-events: none;
        z-index: 9999;
        box-shadow: 0 0 4px rgba(87, 157, 255, 0.6);
        transition: left 0.05s ease-out, top 0.05s ease-out;
      `;
      document.body.appendChild(indicator);
      dropIndicatorRef.current = indicator;
    }
    
    dropIndicatorRef.current.style.left = `${x}px`;
    dropIndicatorRef.current.style.top = `${y - 10}px`;
    dropIndicatorRef.current.style.display = 'block';
  }, []);
  
  const hideDropIndicator = useCallback(() => {
    if (dropIndicatorRef.current) {
      dropIndicatorRef.current.style.display = 'none';
    }
  }, []);
  
  // Cleanup drop indicator on unmount
  useEffect(() => {
    return () => {
      if (dropIndicatorRef.current) {
        dropIndicatorRef.current.remove();
        dropIndicatorRef.current = null;
      }
    };
  }, []);
  
  // Setup drag-and-drop and click handlers for buttons
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('inline-btn')) {
        e.dataTransfer?.setData('text/plain', target.outerHTML);
        e.dataTransfer!.effectAllowed = 'move';
        dragDataRef.current = target.getAttribute('data-btn');
        dragSourceRef.current = target;
        target.style.opacity = '0.4';
        target.classList.add('dragging');
      }
    };
    
    const handleDragEnd = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('inline-btn')) {
        target.style.opacity = '1';
        target.classList.remove('dragging');
      }
      dragSourceRef.current = null;
      hideDropIndicator();
    };
    
    const handleDragOver = (e: DragEvent) => {
      if (!dragDataRef.current) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      
      // Show drop indicator at cursor position
      showDropIndicator(e.clientX, e.clientY);
    };
    
    const handleDragLeave = (e: DragEvent) => {
      // Only hide if leaving the container entirely
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (!container.contains(relatedTarget)) {
        hideDropIndicator();
      }
    };
    
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      hideDropIndicator();
      
      if (!dragDataRef.current) return;
      
      const editor = editorRef.current?.getInstance();
      if (!editor) return;
      
      const html = e.dataTransfer?.getData('text/plain');
      if (html) {
        // Remove the original button first
        let currentHtml = editor.getHTML();
        const originalPattern = new RegExp(
          `<span[^>]*data-btn="${dragDataRef.current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</span>`,
          'gi'
        );
        currentHtml = currentHtml.replace(originalPattern, '');
        editor.setHTML(currentHtml);
        
        // Insert at cursor position
        const wwEditor = (editor as any).wwEditor;
        if (wwEditor?.view) {
          editor.exec('html', html);
        } else {
          editor.setHTML(editor.getHTML() + ' ' + html);
        }
        
        dragDataRef.current = null;
        setTimeout(handleChange, 10);
      }
    };
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btnEl = target.closest('.inline-btn') as HTMLElement;
      
      if (btnEl && !btnEl.classList.contains('dragging')) {
        e.preventDefault();
        e.stopPropagation();
        
        const dataAttr = btnEl.getAttribute('data-btn');
        if (dataAttr) {
          const data = parseInlineButtonFromDataAttr(dataAttr);
          if (data) {
            setEditingButton(data);
            setShowButtonEditor(true);
          }
        }
      }
    };
    
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('dragend', handleDragEnd);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);
    container.addEventListener('click', handleClick);
    
    return () => {
      container.removeEventListener('dragstart', handleDragStart);
      container.removeEventListener('dragend', handleDragEnd);
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('dragleave', handleDragLeave);
      container.removeEventListener('drop', handleDrop);
      container.removeEventListener('click', handleClick);
    };
  }, [handleChange, showDropIndicator, hideDropIndicator]);
  
  const handleSaveButton = useCallback((data: InlineButtonData) => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const newButtonHtml = createButtonHtml(data, encodedData);
    
    if (editingButton) {
      // Replace existing button
      const oldEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(editingButton))));
      let html = editor.getHTML();
      const pattern = new RegExp(
        `<span[^>]*data-btn="${oldEncoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</span>`,
        'gi'
      );
      html = html.replace(pattern, newButtonHtml);
      editor.setHTML(html);
    } else {
      // Insert new button
      editor.exec('html', newButtonHtml);
    }
    
    setEditingButton(null);
    setTimeout(handleChange, 10);
  }, [editingButton, handleChange]);
  
  const handleDeleteButton = useCallback(() => {
    if (!editingButton) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(editingButton))));
    let html = editor.getHTML();
    const pattern = new RegExp(
      `<span[^>]*data-btn="${encodedData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</span>`,
      'gi'
    );
    html = html.replace(pattern, '');
    editor.setHTML(html);
    
    setShowButtonEditor(false);
    setEditingButton(null);
    handleChange();
  }, [editingButton, handleChange]);
  
  const handleAddButton = useCallback(() => {
    setEditingButton(null);
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
      
      <InlineButtonEditor
        open={showButtonEditor}
        onOpenChange={setShowButtonEditor}
        onSave={handleSaveButton}
        onDelete={editingButton ? handleDeleteButton : undefined}
        data={editingButton}
      />
      
      <style>{`
        .toastui-editor-wrapper .inline-btn {
          transition: opacity 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .toastui-editor-wrapper .inline-btn:hover:not(.dragging) {
          box-shadow: 0 0 0 2px rgba(87, 157, 255, 0.4);
        }
        .toastui-editor-wrapper .inline-btn:active,
        .toastui-editor-wrapper .inline-btn.dragging {
          cursor: grabbing;
          transform: scale(0.98);
        }
        .toastui-editor-wrapper .inline-btn.dragging {
          opacity: 0.4 !important;
        }
        .toastui-editor-wrapper .inline-btn img {
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
