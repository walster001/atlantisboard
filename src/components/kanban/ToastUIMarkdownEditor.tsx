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
  const isInternalChange = useRef(false); // Track if change originated from editor
  
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
      isInternalChange.current = true; // Mark as internal change
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
  // Sync external content changes - only when content prop changes from outside
  useEffect(() => {
    // Skip if not initialized or if this is our own change
    if (!isInitialized.current || isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    
    // Only sync if content actually differs from what we last set
    if (content === lastContentRef.current) return;
    
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
  
  // Undo button
  const undoButton = useCallback(() => {
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;width:20px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:3px;margin:0;padding:0;';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>';
    btn.title = 'Undo';
    btn.type = 'button';
    btn.onclick = (e) => {
      e.preventDefault();
      const editor = editorRef.current?.getInstance();
      if (editor) {
        const wwEditor = (editor as any).wwEditor;
        if (wwEditor?.commands?.undo) {
          wwEditor.commands.undo();
        }
      }
    };
    return btn;
  }, []);

  // Redo button
  const redoButton = useCallback(() => {
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;width:20px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:3px;margin:0;padding:0;';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>';
    btn.title = 'Redo';
    btn.type = 'button';
    btn.onclick = (e) => {
      e.preventDefault();
      const editor = editorRef.current?.getInstance();
      if (editor) {
        const wwEditor = (editor as any).wwEditor;
        if (wwEditor?.commands?.redo) {
          wwEditor.commands.redo();
        }
      }
    };
    return btn;
  }, []);

  // Emoji picker button with categories
  const emojiButton = useCallback(() => {
    const RECENT_EMOJIS_KEY = 'toastui-recent-emojis';
    const MAX_RECENT = 20;
    
    const getRecentEmojis = (): string[] => {
      try {
        const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    };
    
    const addRecentEmoji = (emoji: string) => {
      try {
        let recent = getRecentEmojis();
        recent = [emoji, ...recent.filter(e => e !== emoji)].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recent));
      } catch {
        // Ignore localStorage errors
      }
    };
    
    const emojiCategories: Record<string, { icon: string; emojis: string[] }> = {
      'Smileys': { icon: '😀', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'] },
      'Gestures': { icon: '👍', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'] },
      'Hearts': { icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💋', '💌', '💐', '🌹', '🥀', '🌺', '🌸', '🌷', '🌻', '🌼'] },
      'Objects': { icon: '💡', emojis: ['💡', '🔦', '🏮', '🪔', '📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌚', '📡', '🔋', '🔌', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪'] },
      'Symbols': { icon: '✅', emojis: ['✅', '❌', '⭐', '🌟', '💫', '✨', '⚡', '🔥', '💥', '❗', '❓', '❕', '❔', '‼️', '⁉️', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳', '🔲', '🏁', '🚩', '🎌', '🏴', '🏳️', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '☑️', '🔘', '🔃', '🔄', '🔀', '🔁', '🔂', '▶️', '⏩', '⏭️', '⏯️', '◀️', '⏪', '⏮️', '🔼', '⏫', '🔽', '⏬', '⏸️', '⏹️', '⏺️', '⏏️', '🔈', '🔉', '🔊', '🔇', '📢', '📣'] },
      'Activities': { icon: '🎉', emojis: ['🎉', '🎊', '🎈', '🎁', '🎀', '🎄', '🎃', '🎗️', '🎟️', '🎫', '🎖️', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚴', '🚵', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩'] },
      'Nature': { icon: '🌿', emojis: ['🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿', '☘️', '🍀', '🎍', '🪴', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🪨', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'] },
      'Food': { icon: '🍕', emojis: ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐', '🥝', '🍅', '🫒', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🫘', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🫕', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦀', '🦞', '🦐', '🦑', '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🫖', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🫗', '🥤', '🧋', '🧃', '🧉', '🧊'] },
      'Animals': { icon: '🐱', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'] },
    };
    
    // All emojis for search
    const allEmojis: { emoji: string; category: string }[] = [];
    Object.entries(emojiCategories).forEach(([category, data]) => {
      data.emojis.forEach(emoji => {
        allEmojis.push({ emoji, category });
      });
    });
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;';
    
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;width:20px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:12px;margin:0;padding:0;';
    btn.innerHTML = '😀';
    btn.title = 'Insert Emoji';
    btn.type = 'button';
    
    // Create dropdown and append to body for proper z-index layering
    const dropdown = document.createElement('div');
    dropdown.style.cssText = 'position:fixed;z-index:99999;background:#1D2125;border:1px solid #3d444d;border-radius:10px;display:none;flex-direction:column;width:380px;height:480px;box-shadow:0 12px 32px rgba(0,0,0,0.5);';
    document.body.appendChild(dropdown);
    
    // Search input container
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = 'padding:12px;border-bottom:1px solid #3d444d;';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search emojis...';
    searchInput.style.cssText = 'width:100%;padding:8px 12px;border:1px solid #3d444d;border-radius:6px;background:#161b22;color:#e6edf3;font-size:14px;outline:none;box-sizing:border-box;';
    searchInput.onfocus = () => { searchInput.style.borderColor = '#58a6ff'; };
    searchInput.onblur = () => { searchInput.style.borderColor = '#3d444d'; };
    searchContainer.appendChild(searchInput);
    
    // Header with category label
    const header = document.createElement('div');
    header.style.cssText = 'padding:8px 16px 4px;font-size:11px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;';
    header.textContent = 'Recent';
    
    // Category tabs - horizontal scrollable
    const tabsWrapper = document.createElement('div');
    tabsWrapper.style.cssText = 'padding:0 12px 8px;border-bottom:1px solid #3d444d;flex-shrink:0;';
    
    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = 'display:flex;gap:4px;overflow-x:auto;';
    // Hide scrollbar
    const style = document.createElement('style');
    style.textContent = '.emoji-tabs::-webkit-scrollbar{display:none}';
    document.head.appendChild(style);
    tabsContainer.className = 'emoji-tabs';
    
    // Emoji grid scroll container
    const emojiScrollContainer = document.createElement('div');
    emojiScrollContainer.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;';
    
    // Emoji grid
    const emojiGrid = document.createElement('div');
    emojiGrid.style.cssText = 'display:grid;grid-template-columns:repeat(9,1fr);gap:4px;padding:12px;';
    
    const categoryNames = Object.keys(emojiCategories);
    let activeCategory: string | null = 'recent';
    const tabButtons: HTMLButtonElement[] = [];
    
    const createEmojiButton = (emoji: string): HTMLButtonElement => {
      const emojiBtn = document.createElement('button');
      emojiBtn.type = 'button';
      emojiBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:24px;padding:4px;border-radius:6px;transition:background 0.15s,transform 0.1s;display:flex;align-items:center;justify-content:center;width:36px;height:36px;';
      emojiBtn.textContent = emoji;
      emojiBtn.onmouseenter = () => { 
        emojiBtn.style.background = '#3d444d'; 
        emojiBtn.style.transform = 'scale(1.15)';
      };
      emojiBtn.onmouseleave = () => { 
        emojiBtn.style.background = 'none'; 
        emojiBtn.style.transform = 'scale(1)';
      };
      emojiBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      emojiBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const editor = editorRef.current?.getInstance();
        if (editor) {
          editor.insertText(emoji);
          addRecentEmoji(emoji);
        }
        dropdown.style.display = 'none';
      };
      return emojiBtn;
    };
    
    const renderEmojis = (emojis: string[], label: string) => {
      emojiGrid.innerHTML = '';
      header.textContent = label;
      if (emojis.length === 0) {
        const noResults = document.createElement('div');
        noResults.style.cssText = 'grid-column:1/-1;text-align:center;color:#8b949e;padding:24px;font-size:14px;';
        noResults.textContent = label === 'Recent' ? 'No recent emojis yet' : 'No emojis found';
        emojiGrid.appendChild(noResults);
      } else {
        emojis.forEach(emoji => {
          emojiGrid.appendChild(createEmojiButton(emoji));
        });
      }
    };
    
    const renderCategory = (category: string) => {
      if (category === 'recent') {
        renderEmojis(getRecentEmojis(), 'Recent');
      } else {
        renderEmojis(emojiCategories[category].emojis, category);
      }
      emojiScrollContainer.scrollTop = 0;
    };
    
    const updateTabStyles = () => {
      tabButtons.forEach((tabBtn, i) => {
        const cat = i === 0 ? 'recent' : categoryNames[i - 1];
        const isActive = cat === activeCategory;
        tabBtn.style.background = isActive ? '#3d444d' : 'none';
      });
    };
    
    // Recent tab
    const recentTab = document.createElement('button');
    recentTab.type = 'button';
    recentTab.style.cssText = 'background:#3d444d;border:none;cursor:pointer;font-size:16px;padding:6px 8px;border-radius:6px;transition:background 0.15s;flex-shrink:0;';
    recentTab.textContent = '🕐';
    recentTab.title = 'Recent';
    recentTab.onmouseenter = () => { if (activeCategory !== 'recent') recentTab.style.background = '#2d343d'; };
    recentTab.onmouseleave = () => { if (activeCategory !== 'recent') recentTab.style.background = 'none'; };
    recentTab.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeCategory = 'recent';
      searchInput.value = '';
      updateTabStyles();
      renderCategory('recent');
    };
    tabButtons.push(recentTab);
    tabsContainer.appendChild(recentTab);
    
    categoryNames.forEach((category) => {
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;padding:6px 8px;border-radius:6px;transition:background 0.15s;flex-shrink:0;';
      tabBtn.textContent = emojiCategories[category].icon;
      tabBtn.title = category;
      tabBtn.onmouseenter = () => { 
        if (activeCategory !== category) tabBtn.style.background = '#2d343d'; 
      };
      tabBtn.onmouseleave = () => { 
        if (activeCategory !== category) tabBtn.style.background = 'none'; 
      };
      tabBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        activeCategory = category;
        searchInput.value = '';
        updateTabStyles();
        renderCategory(category);
      };
      tabButtons.push(tabBtn);
      tabsContainer.appendChild(tabBtn);
    });
    
    // Search functionality
    searchInput.oninput = () => {
      const query = searchInput.value.toLowerCase().trim();
      if (query === '') {
        activeCategory = 'recent';
        updateTabStyles();
        renderCategory('recent');
      } else {
        activeCategory = null;
        updateTabStyles();
        const filtered = allEmojis.filter(({ emoji }) => emoji.includes(query)).map(e => e.emoji);
        renderEmojis(filtered, `Search: "${query}"`);
      }
    };
    
    tabsWrapper.appendChild(tabsContainer);
    emojiScrollContainer.appendChild(emojiGrid);
    dropdown.appendChild(searchContainer);
    dropdown.appendChild(tabsWrapper);
    dropdown.appendChild(header);
    dropdown.appendChild(emojiScrollContainer);
    
    const positionDropdown = () => {
      const btnRect = btn.getBoundingClientRect();
      const dropdownHeight = 480;
      const dropdownWidth = 380;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      let top = btnRect.bottom + 4;
      if (top + dropdownHeight > viewportHeight - 10) {
        top = btnRect.top - dropdownHeight - 4;
      }
      
      let left = btnRect.right - dropdownWidth;
      if (left < 10) left = 10;
      if (left + dropdownWidth > viewportWidth - 10) {
        left = viewportWidth - dropdownWidth - 10;
      }
      
      dropdown.style.top = `${Math.max(10, top)}px`;
      dropdown.style.left = `${left}px`;
    };
    
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isVisible = dropdown.style.display !== 'none';
      if (isVisible) {
        dropdown.style.display = 'none';
      } else {
        positionDropdown();
        dropdown.style.display = 'flex';
        activeCategory = 'recent';
        searchInput.value = '';
        updateTabStyles();
        renderCategory('recent');
        setTimeout(() => searchInput.focus(), 50);
      }
    };
    
    // Prevent dropdown from closing when interacting with it
    dropdown.onmousedown = (e) => {
      e.stopPropagation();
    };
    
    // Close on outside click
    const handleOutsideClick = (e: MouseEvent) => {
      if (!wrapper.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        dropdown.style.display = 'none';
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    
    // Cleanup dropdown from body when wrapper is removed
    const observer = new MutationObserver(() => {
      if (!document.body.contains(wrapper)) {
        dropdown.remove();
        document.removeEventListener('mousedown', handleOutsideClick);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    wrapper.appendChild(btn);
    return wrapper;
  }, []);

  // Create toolbar button for inserting new buttons (styled like codeblock)
  const toolbarButton = useCallback(() => {
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;width:20px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:8px;font-weight:600;font-family:monospace;margin:0;padding:0;';
    btn.innerHTML = 'INB';
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
          [
            { el: undoButton(), tooltip: 'Undo', name: 'undo' },
            { el: redoButton(), tooltip: 'Redo', name: 'redo' },
            'heading', 'bold', 'italic', 'strike',
            'hr', 'quote',
            'ul', 'ol', 'task', 'indent', 'outdent',
            'table', 'link',
            'code', 'codeblock',
            { el: toolbarButton(), tooltip: 'Insert Inline Button', name: 'inlineButton' },
            { el: emojiButton(), tooltip: 'Insert Emoji', name: 'emoji' },
          ],
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
          padding: 4px 6px !important;
        }
        .toastui-editor-wrapper .toastui-editor-toolbar {
          flex-wrap: nowrap !important;
        }
        .toastui-editor-wrapper .toastui-editor-toolbar-group {
          display: flex !important;
          flex-wrap: nowrap !important;
          gap: 1px !important;
        }
        .toastui-editor-wrapper .toastui-editor-toolbar-icons {
          width: 20px !important;
          height: 24px !important;
          margin: 0 !important;
          padding: 0 !important;
          background-size: 12px 12px !important;
        }
        .toastui-editor-wrapper .toastui-editor-toolbar-icons::before {
          transform: scale(0.7) !important;
        }
        .toastui-editor-wrapper .toastui-editor-more-button,
        .toastui-editor-wrapper .toastui-editor-toolbar-more {
          display: none !important;
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
