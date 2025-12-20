/**
 * ToastUIMarkdownEditor.tsx
 * 
 * A WYSIWYG Markdown editor using Toast UI Editor.
 * Handles markdown content and inline buttons properly.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Editor } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import { marked } from 'marked';
import { cn } from '@/lib/utils';
import { InlineButtonEditor, InlineButtonData, parseInlineButtonFromDataAttr } from './InlineButtonEditor';

interface ToastUIMarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
}

// Configure marked for consistent output
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Serialize inline button data to HTML for display in WYSIWYG editor.
 * Uses a visually styled span that Toast UI can render.
 */
function serializeInlineButtonHtml(data: InlineButtonData): string {
  const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const iconHtml = data.iconUrl 
    ? `<img src="${data.iconUrl}" alt="" style="width:${data.iconSize}px;height:${data.iconSize}px;object-fit:contain;flex-shrink:0;vertical-align:middle;margin-right:4px;">` 
    : '';
  
  return `<span class="editable-inline-button" data-inline-button="${encodedData}" contenteditable="false" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background-color:${data.backgroundColor};border:1px solid #3d444d;white-space:nowrap;cursor:pointer;vertical-align:middle;">${iconHtml}<span style="color:${data.textColor};text-decoration:none;white-space:nowrap;">${data.linkText}</span></span>`;
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
    // Skip if already our format
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
 * Convert content to HTML for the editor.
 * Handles:
 * 1. [INLINE_BUTTON:...] markdown format -> HTML spans
 * 2. Markdown syntax -> HTML (using marked)
 * 3. Legacy Wekan inline buttons -> HTML spans
 */
function prepareContentForEditor(content: string): string {
  if (!content?.trim()) return '';
  
  let result = content;
  
  // Step 1: Convert [INLINE_BUTTON:...] markers to HTML spans FIRST
  result = result.replace(/\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g, (_match, dataAttr) => {
    const data = parseInlineButtonFromDataAttr(dataAttr);
    if (data) {
      return serializeInlineButtonHtml(data);
    }
    return '';
  });
  
  // Step 2: Check if content still has markdown syntax that needs parsing
  // Skip if content is already pure HTML
  const hasMarkdownSyntax = /(?:^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|(\*\*|__|~~|```|\[.+\]\(.+\))/m.test(result);
  const isPureHtml = result.trim().startsWith('<') && !hasMarkdownSyntax;
  
  if (!isPureHtml && hasMarkdownSyntax) {
    // We need to protect existing HTML (inline buttons) before parsing markdown
    const htmlPlaceholders: Map<string, string> = new Map();
    let placeholderIndex = 0;
    
    // Protect all editable-inline-button spans
    result = result.replace(/<span[^>]*class="[^"]*editable-inline-button[^"]*"[^>]*>[\s\S]*?<\/span>/gi, (match) => {
      const token = `__HTMLPLACEHOLDER${placeholderIndex++}__`;
      htmlPlaceholders.set(token, match);
      return token;
    });
    
    // Parse markdown to HTML
    result = marked.parse(result, { async: false }) as string;
    
    // Restore protected HTML
    for (const [token, html] of htmlPlaceholders) {
      result = result.replace(token, html);
      // Also handle if token got wrapped in <p> tags
      result = result.replace(new RegExp(`<p>\\s*${token}\\s*</p>`, 'g'), html);
    }
  } else if (!isPureHtml && !result.includes('<')) {
    // Plain text without any HTML, parse as markdown
    result = marked.parse(result, { async: false }) as string;
  }
  
  // Step 3: Transform any legacy Wekan buttons still in HTML
  result = transformLegacyInlineButtons(result);
  
  return result;
}

/**
 * Convert HTML back to markdown format, preserving inline buttons.
 */
function convertToMarkdown(html: string): string {
  if (!html?.trim()) return '';
  
  let result = html;
  
  // Convert inline button HTML to our markdown format FIRST
  const buttonPattern = /<span[^>]*class="[^"]*editable-inline-button[^"]*"[^>]*data-inline-button="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi;
  result = result.replace(buttonPattern, (_match, dataAttr) => {
    return `[INLINE_BUTTON:${dataAttr}]`;
  });
  
  // Convert basic HTML back to markdown
  // Headers
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n');
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n');
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n');
  result = result.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n');
  result = result.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n');
  result = result.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n');
  
  // Bold and italic
  result = result.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  result = result.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  result = result.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  result = result.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  result = result.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');
  result = result.replace(/<strike[^>]*>([\s\S]*?)<\/strike>/gi, '~~$1~~');
  result = result.replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~');
  
  // Code
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  result = result.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```');
  
  // Links (but not inside buttons which are already converted)
  result = result.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  
  // Lists - handle properly
  result = result.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  result = result.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  
  // Blockquotes
  result = result.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n');
  
  // Horizontal rules
  result = result.replace(/<hr\s*\/?>/gi, '\n---\n');
  
  // Paragraphs and breaks
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = result.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  result = result.replace(/<\/?p[^>]*>/gi, '');
  
  // Remove any remaining HTML tags (except our button markers)
  result = result.replace(/<\/?(?!INLINE_BUTTON)[a-z][^>]*>/gi, '');
  
  // Decode HTML entities
  result = result
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  // Clean up extra whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim();
  
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
  const isInitialized = useRef(false);
  const lastContentRef = useRef(content);
  
  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    // Get HTML from WYSIWYG mode
    const html = editorInstance.getHTML();
    const markdown = convertToMarkdown(html);
    
    // Only trigger onChange if content actually changed
    if (markdown !== lastContentRef.current) {
      lastContentRef.current = markdown;
      onChange(markdown);
    }
  }, [onChange]);
  
  // Initialize editor with HTML content after mount
  useEffect(() => {
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance || isInitialized.current) return;
    
    // Small delay to ensure editor is fully mounted
    const timeoutId = setTimeout(() => {
      const htmlContent = prepareContentForEditor(content);
      if (htmlContent) {
        isSyncing.current = true;
        editorInstance.setHTML(htmlContent);
        isSyncing.current = false;
      }
      lastContentRef.current = content;
      isInitialized.current = true;
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [content]);
  
  // Handle clicking on inline buttons in the editor
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
  
  // Sync external content changes (only if content differs significantly)
  useEffect(() => {
    if (!isInitialized.current) return;
    if (content === lastContentRef.current) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    // Only sync if external content is meaningfully different
    const currentHtml = editorInstance.getHTML();
    const currentMarkdown = convertToMarkdown(currentHtml);
    
    if (currentMarkdown !== content) {
      isSyncing.current = true;
      const newContent = prepareContentForEditor(content);
      editorInstance.setHTML(newContent);
      lastContentRef.current = content;
      isSyncing.current = false;
    }
  }, [content]);
  
  const handleInsertInlineButton = useCallback((data: InlineButtonData) => {
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    const html = serializeInlineButtonHtml(data);
    
    if (editingButtonData) {
      // Replace existing button - find and replace in current HTML
      let currentHtml = editorInstance.getHTML();
      const oldDataAttr = btoa(unescape(encodeURIComponent(JSON.stringify(editingButtonData))));
      
      // Try to find the old button by its data attribute
      const oldButtonPattern = new RegExp(
        `<span[^>]*data-inline-button="${oldDataAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</span>`,
        'gi'
      );
      
      if (oldButtonPattern.test(currentHtml)) {
        currentHtml = currentHtml.replace(oldButtonPattern, html);
      } else {
        // Fallback: try to find by button ID
        const idPattern = new RegExp(
          `<span[^>]*data-inline-button="[^"]*"[^>]*>[\\s\\S]*?</span>`,
          'gi'
        );
        // Replace first matching button (simple case)
        currentHtml = currentHtml.replace(idPattern, (match, offset, str) => {
          // Only replace once
          if (str.indexOf(match) === offset) {
            return html;
          }
          return match;
        });
      }
      
      editorInstance.setHTML(currentHtml);
    } else {
      // Insert new button at cursor position
      // Use insertHTML which properly inserts HTML at cursor
      try {
        // Get the wysiwyg editor instance
        const wwEditor = (editorInstance as any).wwEditor;
        if (wwEditor && wwEditor.view) {
          // Use ProseMirror's insertHTML if available
          const { state, dispatch } = wwEditor.view;
          const { from } = state.selection;
          
          // Create a temporary element to get the HTML fragment
          const temp = document.createElement('div');
          temp.innerHTML = html;
          
          // Insert HTML using the editor's exec command
          editorInstance.exec('htmlBlock', { html });
        } else {
          // Fallback: append at end
          const currentHtml = editorInstance.getHTML();
          editorInstance.setHTML(currentHtml + ' ' + html + ' ');
        }
      } catch {
        // Final fallback
        const currentHtml = editorInstance.getHTML();
        editorInstance.setHTML(currentHtml + ' ' + html + ' ');
      }
    }
    
    setEditingButtonData(null);
    
    // Trigger change after a small delay to let the editor update
    setTimeout(() => handleChange(), 10);
  }, [editingButtonData, handleChange]);
  
  const handleDeleteInlineButton = useCallback(() => {
    if (!editingButtonData) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    let currentHtml = editorInstance.getHTML();
    const dataAttr = btoa(unescape(encodeURIComponent(JSON.stringify(editingButtonData))));
    const pattern = new RegExp(
      `<span[^>]*data-inline-button="${dataAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</span>`,
      'gi'
    );
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
  
  // Create custom toolbar button for inline buttons
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
      
      {/* Inline Button Editor Dialog */}
      <InlineButtonEditor
        open={showInlineButtonEditor}
        onOpenChange={setShowInlineButtonEditor}
        onSave={handleInsertInlineButton}
        onDelete={editingButtonData ? handleDeleteInlineButton : undefined}
        data={editingButtonData}
      />
      
      {/* Custom styles for inline buttons in the WYSIWYG editor */}
      <style>{`
        /* Style inline buttons inside Toast UI editor */
        .toastui-editor-wrapper .toastui-editor-contents .editable-inline-button,
        .toastui-editor-wrapper .ProseMirror .editable-inline-button,
        .toastui-editor-ww-container .editable-inline-button {
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          padding: 3px 8px !important;
          border-radius: 4px !important;
          border: 1px solid #3d444d !important;
          white-space: nowrap !important;
          cursor: pointer !important;
          vertical-align: middle !important;
          font-size: 14px !important;
          line-height: 1.4 !important;
          margin: 0 2px !important;
        }
        
        .toastui-editor-wrapper .toastui-editor-contents .editable-inline-button:hover,
        .toastui-editor-wrapper .ProseMirror .editable-inline-button:hover {
          opacity: 0.9;
          box-shadow: 0 0 0 2px rgba(87, 157, 255, 0.3);
        }
        
        .toastui-editor-wrapper .editable-inline-button img {
          display: inline-block !important;
          vertical-align: middle !important;
          flex-shrink: 0 !important;
        }
        
        /* Ensure the button text doesn't have unwanted styling */
        .toastui-editor-wrapper .editable-inline-button span {
          text-decoration: none !important;
          display: inline !important;
        }
        
        /* Make buttons non-editable visually */
        .toastui-editor-wrapper .editable-inline-button[contenteditable="false"] {
          user-select: none;
          -webkit-user-select: none;
        }
      `}</style>
    </div>
  );
}
