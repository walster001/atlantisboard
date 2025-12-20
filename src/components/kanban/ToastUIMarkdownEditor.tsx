/**
 * ToastUIMarkdownEditor.tsx
 * 
 * A WYSIWYG Markdown editor using Toast UI Editor.
 * Simpler integration that handles raw HTML inline buttons properly.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Editor } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import { cn } from '@/lib/utils';
import { InlineButtonEditor, InlineButtonData, parseInlineButtonFromDataAttr } from './InlineButtonEditor';
import { Button } from '@/components/ui/button';
import { SquareArrowOutUpRight } from 'lucide-react';

interface ToastUIMarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Transform legacy Wekan inline buttons to our editable format.
 */
function transformLegacyInlineButtons(html: string): string {
  if (!html) return html;
  
  let result = html;
  
  // Pattern: Wekan-style inline buttons with display:inline-flex containing <a> tags
  const wekanPattern = /<span[^>]*style=['"][^'"]*display\s*:\s*inline-?flex[^'"]*['"][^>]*>([\s\S]*?)<\/span>/gi;
  
  result = result.replace(wekanPattern, (match) => {
    if (match.includes('editable-inline-button') || match.includes('data-inline-button')) {
      return match;
    }
    
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
  
  return result;
}

/**
 * Serialize inline button data to HTML.
 */
function serializeInlineButtonHtml(data: InlineButtonData): string {
  const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return `<span class="editable-inline-button" data-inline-button="${encodedData}" data-bg-color="${data.backgroundColor}" data-text-color="${data.textColor}" data-link-url="${data.linkUrl}" contenteditable="false" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background-color:${data.backgroundColor};border:1px solid #3d444d;white-space:nowrap;cursor:pointer;">${
    data.iconUrl ? `<img src="${data.iconUrl}" alt="" style="width:${data.iconSize}px;height:${data.iconSize}px;object-fit:contain;flex-shrink:0;">` : ''
  }<span class="inline-button-text" style="color:${data.textColor};text-decoration:none;white-space:nowrap;">${data.linkText}</span></span>`;
}

/**
 * Convert content to HTML for the editor, handling our inline button format.
 */
function prepareContentForEditor(content: string): string {
  if (!content?.trim()) return '';
  
  let result = content;
  
  // Convert [INLINE_BUTTON:...] markdown format to HTML
  result = result.replace(/\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g, (_match, dataAttr) => {
    const data = parseInlineButtonFromDataAttr(dataAttr);
    if (data) {
      return serializeInlineButtonHtml(data);
    }
    return '';
  });
  
  // Transform legacy Wekan buttons
  result = transformLegacyInlineButtons(result);
  
  return result;
}

/**
 * Convert HTML back to markdown format, preserving inline buttons.
 */
function convertToMarkdown(html: string): string {
  if (!html?.trim()) return '';
  
  let result = html;
  
  // Convert inline button HTML to our markdown format
  const buttonPattern = /<span[^>]*class="[^"]*editable-inline-button[^"]*"[^>]*data-inline-button="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi;
  result = result.replace(buttonPattern, (_match, dataAttr) => {
    return `[INLINE_BUTTON:${dataAttr}]`;
  });
  
  return result;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  
  // Initialize with prepared content
  const initialContent = useRef(prepareContentForEditor(content));
  
  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    // Get HTML from WYSIWYG mode
    const html = editorInstance.getHTML();
    const markdown = convertToMarkdown(html);
    onChange(markdown);
  }, [onChange]);
  
  // Handle clicking on inline buttons
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
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
            setShowInlineButtonEditor(true);
          }
        }
      }
    };
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('click', handleClick);
      return () => container.removeEventListener('click', handleClick);
    }
  }, []);
  
  // Sync external content changes
  useEffect(() => {
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    const currentHtml = editorInstance.getHTML();
    const currentMarkdown = convertToMarkdown(currentHtml);
    
    if (currentMarkdown !== content) {
      isSyncing.current = true;
      const newContent = prepareContentForEditor(content);
      editorInstance.setHTML(newContent);
      isSyncing.current = false;
    }
  }, [content]);
  
  const handleInsertInlineButton = useCallback((data: InlineButtonData) => {
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    const html = serializeInlineButtonHtml(data);
    
    if (editingButtonData) {
      // Replace existing button - get current HTML and replace
      let currentHtml = editorInstance.getHTML();
      const oldDataAttr = btoa(unescape(encodeURIComponent(JSON.stringify(editingButtonData))));
      const pattern = new RegExp(`<span[^>]*data-inline-button="${oldDataAttr}"[^>]*>[\\s\\S]*?</span>`, 'gi');
      currentHtml = currentHtml.replace(pattern, html);
      editorInstance.setHTML(currentHtml);
    } else {
      // Insert new button at cursor
      editorInstance.insertText(html);
    }
    
    setEditingButtonData(null);
    handleChange();
  }, [editingButtonData, handleChange]);
  
  const handleDeleteInlineButton = useCallback(() => {
    if (!editingButtonData) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    let currentHtml = editorInstance.getHTML();
    const dataAttr = btoa(unescape(encodeURIComponent(JSON.stringify(editingButtonData))));
    const pattern = new RegExp(`<span[^>]*data-inline-button="${dataAttr}"[^>]*>[\\s\\S]*?</span>`, 'gi');
    currentHtml = currentHtml.replace(pattern, '');
    editorInstance.setHTML(currentHtml);
    
    setShowInlineButtonEditor(false);
    setEditingButtonData(null);
    handleChange();
  }, [editingButtonData, handleChange]);
  
  const handleAddNewButton = useCallback(() => {
    setEditingButtonData(null);
    setShowInlineButtonEditor(true);
  }, []);

  return (
    <div ref={containerRef} className={cn('border rounded-lg bg-background relative', className)}>
      {/* Add button toolbar */}
      <div className="flex items-center gap-1 p-1 border-b bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddNewButton}
          className="h-8 px-2 text-xs"
          title="Add Inline Button"
        >
          <SquareArrowOutUpRight className="h-4 w-4 mr-1" />
          Add Button
        </Button>
      </div>
      
      <Editor
        ref={editorRef}
        initialValue={initialContent.current}
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
        ]}
      />
      
      {/* Inline Button Editor Dialog */}
      <InlineButtonEditor
        open={showInlineButtonEditor}
        onOpenChange={setShowInlineButtonEditor}
        onSave={handleInsertInlineButton}
        onDelete={editingButtonData ? handleDeleteInlineButton : undefined}
        data={editingButtonData}
      />
      
      {/* Custom styles for inline buttons in editor */}
      <style>{`
        .toastui-editor-contents .editable-inline-button {
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          padding: 3px 8px !important;
          border-radius: 4px !important;
          border: 1px solid #3d444d !important;
          white-space: nowrap !important;
          cursor: pointer !important;
          vertical-align: middle !important;
        }
        .toastui-editor-contents .editable-inline-button:hover {
          opacity: 0.9;
          box-shadow: 0 0 0 2px rgba(87, 157, 255, 0.3);
        }
        .toastui-editor-contents .inline-button-text {
          text-decoration: none !important;
        }
      `}</style>
    </div>
  );
}
