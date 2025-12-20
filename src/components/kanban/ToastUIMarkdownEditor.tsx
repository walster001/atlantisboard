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
 * Convert content to HTML for the editor.
 * Handles:
 * 1. [INLINE_BUTTON:...] markdown format -> HTML spans
 * 2. Markdown syntax -> HTML (using marked)
 * 3. Legacy Wekan inline buttons -> HTML spans
 */
function prepareContentForEditor(content: string): string {
  if (!content?.trim()) return '';
  
  let result = content;
  
  // Step 1: Protect inline button markers by temporarily replacing them
  const buttonPlaceholders: Map<string, string> = new Map();
  let buttonIndex = 0;
  
  result = result.replace(/\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g, (_match, dataAttr) => {
    const data = parseInlineButtonFromDataAttr(dataAttr);
    if (data) {
      const token = `INLINEBTNPLACEHOLDER${buttonIndex++}`;
      buttonPlaceholders.set(token, serializeInlineButtonHtml(data));
      return token;
    }
    return '';
  });
  
  // Step 2: Check if content is already HTML or needs markdown parsing
  const trimmed = result.trim();
  const startsWithHtml = trimmed.startsWith('<') && (
    trimmed.startsWith('<p>') ||
    trimmed.startsWith('<p ') ||
    trimmed.startsWith('<h') ||
    trimmed.startsWith('<ul') ||
    trimmed.startsWith('<ol') ||
    trimmed.startsWith('<div') ||
    trimmed.startsWith('<blockquote') ||
    trimmed.startsWith('<pre')
  );
  
  // Check for markdown syntax
  const hasMarkdownSyntax = /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|\*\*|__|```|\[.+\]\(.+\))/m.test(result);
  
  if (!startsWithHtml || hasMarkdownSyntax) {
    // Parse as markdown
    result = marked.parse(result, { async: false }) as string;
  }
  
  // Step 3: Restore button placeholders
  for (const [token, html] of buttonPlaceholders) {
    // Replace token wherever it appears (might be wrapped in <p> or other tags)
    const tokenRegex = new RegExp(`(<p>)?\\s*${token}\\s*(<\\/p>)?`, 'g');
    result = result.replace(tokenRegex, html);
  }
  
  // Step 4: Transform any legacy Wekan buttons still in HTML
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
  result = result.replace(/<h1[^>]*>([^<]*)<\/h1>/gi, '# $1\n');
  result = result.replace(/<h2[^>]*>([^<]*)<\/h2>/gi, '## $1\n');
  result = result.replace(/<h3[^>]*>([^<]*)<\/h3>/gi, '### $1\n');
  result = result.replace(/<h4[^>]*>([^<]*)<\/h4>/gi, '#### $1\n');
  result = result.replace(/<h5[^>]*>([^<]*)<\/h5>/gi, '##### $1\n');
  result = result.replace(/<h6[^>]*>([^<]*)<\/h6>/gi, '###### $1\n');
  
  // Bold and italic
  result = result.replace(/<strong>([^<]*)<\/strong>/gi, '**$1**');
  result = result.replace(/<b>([^<]*)<\/b>/gi, '**$1**');
  result = result.replace(/<em>([^<]*)<\/em>/gi, '*$1*');
  result = result.replace(/<i>([^<]*)<\/i>/gi, '*$1*');
  result = result.replace(/<s>([^<]*)<\/s>/gi, '~~$1~~');
  result = result.replace(/<strike>([^<]*)<\/strike>/gi, '~~$1~~');
  result = result.replace(/<del>([^<]*)<\/del>/gi, '~~$1~~');
  
  // Code
  result = result.replace(/<code>([^<]*)<\/code>/gi, '`$1`');
  result = result.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```');
  
  // Links
  result = result.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');
  
  // Lists
  result = result.replace(/<li>([^<]*)<\/li>/gi, '- $1\n');
  result = result.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  
  // Blockquotes
  result = result.replace(/<blockquote>([^<]*)<\/blockquote>/gi, '> $1\n');
  
  // Horizontal rules
  result = result.replace(/<hr\s*\/?>/gi, '---\n');
  
  // Paragraphs and breaks
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = result.replace(/<\/p>\s*<p>/gi, '\n\n');
  result = result.replace(/<\/?p[^>]*>/gi, '');
  
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
  
  // Handle editor changes
  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editorInstance = editorRef.current?.getInstance();
    if (!editorInstance) return;
    
    // Get HTML from WYSIWYG mode
    const html = editorInstance.getHTML();
    const markdown = convertToMarkdown(html);
    onChange(markdown);
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
      isInitialized.current = true;
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [content]);
  
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
  
  // Sync external content changes (after initial load)
  useEffect(() => {
    if (!isInitialized.current) return;
    
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
      // Insert new button at cursor using exec command
      const wwEditor = editorInstance.getCurrentModeEditor();
      if (wwEditor && typeof wwEditor.replaceSelection === 'function') {
        wwEditor.replaceSelection(html);
      } else {
        // Fallback: append to content
        const currentHtml = editorInstance.getHTML();
        editorInstance.setHTML(currentHtml + html);
      }
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
  
  // Create custom toolbar button for inline buttons
  const customToolbarButton = useCallback(() => {
    const button = document.createElement('button');
    button.className = 'toastui-editor-toolbar-icons';
    button.style.cssText = 'background: none; border: none; cursor: pointer; padding: 4px 8px; font-size: 12px; font-weight: 500; color: inherit; display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 4px;';
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
    <div ref={containerRef} className={cn('border rounded-lg bg-background relative', className)}>
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
