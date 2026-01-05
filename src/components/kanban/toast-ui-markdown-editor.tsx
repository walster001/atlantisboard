import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Editor } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import { cn } from '@/lib/utils';
import { InlineButtonEditor, InlineButtonData, parseInlineButtonFromDataAttr } from './inline-button-editor';
import twemoji from '@twemoji/api';
import { 
  EMOJI_CATEGORIES, 
  CATEGORY_NAMES, 
  getRecentEmojis, 
  addRecentEmoji, 
  getAllEmojis 
} from './emojiData';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

interface ToastUIMarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  themeBackgroundColor?: string;
  themeTextColor?: string;
  useIntelligentContrast?: boolean;
}

// Helper to parse hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Calculate luminance for intelligent contrast
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Determine if background is dark based on luminance
function isDarkBackground(backgroundColor: string): boolean {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return false;
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance < 0.5;
}

// Match [INLINE_BUTTON:base64data] format
const INLINE_BUTTON_WIDGET_RULE = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/;

const DEFAULT_BORDER_RADIUS = 4;

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
  themeBackgroundColor,
  themeTextColor,
}: ToastUIMarkdownEditorProps) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const isMobileOrTablet = isMobile || isTablet;

  const isDark = useMemo(() => {
    if (themeBackgroundColor) {
      return isDarkBackground(themeBackgroundColor);
    }
    return false;
  }, [themeBackgroundColor]);

  const containerStyle = useMemo(() => {
    const style: React.CSSProperties = {};
    if (themeBackgroundColor) {
      style.backgroundColor = themeBackgroundColor;
    }
    if (themeTextColor) {
      style.color = themeTextColor;
    }
    return style;
  }, [themeBackgroundColor, themeTextColor]);

  const editorRef = useRef<Editor>(null);
  const [showButtonEditor, setShowButtonEditor] = useState(false);
  const [editingButton, setEditingButton] = useState<InlineButtonData | null>(null);
  const [editingEncodedData, setEditingEncodedData] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const isInitialized = useRef(false);
  const lastContentRef = useRef(content);
  const isInternalChange = useRef(false);
  
  const cleanWidgetMarkers = useCallback((text: string): string => {
    let cleaned = text.replace(/\$\$widget\d+\s*/g, '');
    cleaned = cleaned.replace(/\$\$(?!\[INLINE_BUTTON)/g, '');
    cleaned = cleaned.replace(/\s*\$\$\s*$/gm, '');
    return cleaned;
  }, []);

  const handleChange = useCallback(() => {
    if (isSyncing.current || !isInitialized.current) return;
    
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    let markdown = editor.getMarkdown();
    markdown = cleanWidgetMarkers(markdown);
    
    if (markdown !== lastContentRef.current) {
      lastContentRef.current = markdown;
      isInternalChange.current = true;
      onChange(markdown);
    }
  }, [onChange, cleanWidgetMarkers]);
  
  // Helper function to parse emojis in the editor with Twemoji
  const parseTwemojiInEditor = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Find the editor content area and parse emojis
    const contentArea = container.querySelector('.toastui-editor-contents');
    if (contentArea) {
      twemoji.parse(contentArea as HTMLElement, {
        folder: 'svg',
        ext: '.svg',
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
        className: 'twemoji-editor',
      });
    }
  }, []);
  
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
      
      // Parse Twemoji after content is set
      setTimeout(parseTwemojiInEditor, 50);
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [content, parseTwemojiInEditor]);
  
  // Re-parse Twemoji when content changes in the editor
  useEffect(() => {
    if (!isInitialized.current) return;
    
    const timeoutId = setTimeout(parseTwemojiInEditor, 100);
    return () => clearTimeout(timeoutId);
  }, [content, parseTwemojiInEditor]);

  // Handle codeblock deletion with backspace
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      
      const editor = editorRef.current?.getInstance();
      if (!editor) return;
      
      const wwEditor = editor.getCurrentModeEditor();
      if (!wwEditor?.view) return;
      
      const { state, dispatch } = wwEditor.view;
      const { selection } = state;
      const { $from, empty } = selection;
      
      // Check if we're in or near a codeBlock
      const codeBlock = $from.parent.type.name === 'codeBlock' ? $from.parent : null;
      const nodeBeforeCursor = $from.nodeBefore;
      
      // If cursor is at start of empty codeblock, delete it
      if (codeBlock && empty && $from.parentOffset === 0 && codeBlock.textContent === '') {
        e.preventDefault();
        const pos = $from.before($from.depth);
        const tr = state.tr.delete(pos, pos + codeBlock.nodeSize);
        dispatch(tr);
        return;
      }
      
      // If cursor is right after a codeblock and we press backspace
      if (e.key === 'Backspace' && nodeBeforeCursor?.type.name === 'codeBlock') {
        e.preventDefault();
        const pos = $from.pos - nodeBeforeCursor.nodeSize;
        const tr = state.tr.delete(pos, $from.pos);
        dispatch(tr);
        return;
      }
    };
    
    container.addEventListener('keydown', handleKeyDown, true);
    return () => container.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Sync external content changes
  useEffect(() => {
    if (!isInitialized.current || isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    
    if (content === lastContentRef.current) return;
    
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
            setEditingEncodedData(encodedData);
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
    
    const newEncodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const newButtonMarkdown = `[INLINE_BUTTON:${newEncodedData}]`;
    
    if (editingEncodedData) {
      let markdown = editor.getMarkdown();
      const oldMarker = `[INLINE_BUTTON:${editingEncodedData}]`;
      markdown = markdown.replace(oldMarker, newButtonMarkdown);
      editor.setMarkdown(markdown);
    } else {
      editor.insertText(newButtonMarkdown);
    }
    
    setEditingButton(null);
    setEditingEncodedData(null);
    setTimeout(handleChange, 10);
  }, [editingEncodedData, handleChange]);
  
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
  
  const handleAddButton = useCallback(() => {
    setEditingButton(null);
    setEditingEncodedData(null);
    setShowButtonEditor(true);
  }, []);

  // Handle indent action
  const handleIndent = useCallback(() => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const wwEditor = editor.getCurrentModeEditor();
    if (wwEditor?.view) {
      const { state, dispatch } = wwEditor.view;
      const { selection } = state;
      const tr = state.tr.insertText('  ', selection.from);
      dispatch(tr);
    }
  }, []);

  // Handle outdent action
  const handleOutdent = useCallback(() => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;
    
    const wwEditor = editor.getCurrentModeEditor();
    if (wwEditor?.view) {
      const { state, dispatch } = wwEditor.view;
      const { $from } = state.selection;
      const lineStart = $from.start();
      const textBefore = state.doc.textBetween(lineStart, $from.pos);
      
      // Check for leading whitespace
      if (textBefore.startsWith('  ')) {
        const tr = state.tr.delete(lineStart, lineStart + 2);
        dispatch(tr);
      } else if (textBefore.startsWith('\t')) {
        const tr = state.tr.delete(lineStart, lineStart + 1);
        dispatch(tr);
      } else if (textBefore.startsWith(' ')) {
        const tr = state.tr.delete(lineStart, lineStart + 1);
        dispatch(tr);
      }
    }
  }, []);

  // Create custom indent toolbar button with SVG icon
  const createIndentToolbarItem = useCallback(() => {
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons custom-indent';
    btn.title = 'Indent';
    btn.type = 'button';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/><polyline points="3 8 7 12 3 16"/></svg>`;
    btn.onclick = (e) => { 
      e.preventDefault(); 
      handleIndent();
    };
    return btn;
  }, [handleIndent]);

  // Create custom outdent toolbar button with SVG icon
  const createOutdentToolbarItem = useCallback(() => {
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons custom-outdent';
    btn.title = 'Outdent';
    btn.type = 'button';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/><polyline points="7 8 3 12 7 16"/></svg>`;
    btn.onclick = (e) => { 
      e.preventDefault(); 
      handleOutdent();
    };
    return btn;
  }, [handleOutdent]);

  // Create INB (Inline Button) toolbar button
  const createInlineButtonToolbarItem = useCallback(() => {
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:11px;font-weight:700;font-family:monospace;padding:0;width:24px;height:24px;';
    btn.innerHTML = 'INB';
    btn.title = 'Insert Inline Button';
    btn.type = 'button';
    btn.onclick = (e) => { e.preventDefault(); handleAddButton(); };
    return btn;
  }, [handleAddButton]);

  // Create Emoji picker toolbar button
  const createEmojiToolbarItem = useCallback(() => {
    const allEmojis = getAllEmojis();
    
    // Twemoji helper - get image URL for an emoji
    const getEmojiImgSrc = (emoji: string): string => {
      const parsed = twemoji.parse(emoji, {
        folder: 'svg',
        ext: '.svg',
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
      });
      const match = parsed.match(/src="([^"]+)"/);
      return match ? match[1] : '';
    };
    
    // State
    let isOpen = false;
    let activeCategory = 'recent';
    let savedSelection: { start: number; end: number } | null = null;
    const tabButtons: HTMLButtonElement[] = [];
    
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;';
    wrapper.setAttribute('data-emoji-picker-wrapper', 'true');
    
    // Create toolbar button with Twemoji
    const btn = document.createElement('button');
    btn.className = 'toastui-editor-toolbar-icons';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px;padding:0;width:24px;height:24px;';
    const toolbarSrc = getEmojiImgSrc('😀');
    btn.innerHTML = toolbarSrc 
      ? `<img src="${toolbarSrc}" alt="😀" style="width:18px;height:18px;" draggable="false" />`
      : '😀';
    btn.title = 'Insert Emoji';
    btn.type = 'button';
    
    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.setAttribute('data-emoji-dropdown', 'true');
    dropdown.style.cssText = 'position:fixed;z-index:2147483647;background:#1D2125;border:1px solid #3d444d;border-radius:10px;display:none;flex-direction:column;width:340px;height:420px;box-shadow:0 12px 32px rgba(0,0,0,0.5);';
    
    // Prevent focus loss and stop propagation so document listener doesn't close dropdown
    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevents focus loss from editor
      e.stopPropagation(); // Prevents document mousedown handler from closing
    }, false);
    
    // Search input
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = 'padding:10px;border-bottom:1px solid #3d444d;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search emojis...';
    searchInput.style.cssText = 'width:100%;padding:8px 12px;border:1px solid #3d444d;border-radius:6px;background:#161b22;color:#e6edf3;font-size:14px;outline:none;box-sizing:border-box;';
    searchContainer.appendChild(searchInput);
    
    // Tabs
    const tabsWrapper = document.createElement('div');
    tabsWrapper.style.cssText = 'padding:6px 10px;border-bottom:1px solid #3d444d;overflow-x:auto;';
    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = 'display:flex;gap:2px;';
    tabsWrapper.appendChild(tabsContainer);
    
    // Category header
    const header = document.createElement('div');
    header.style.cssText = 'padding:6px 12px;font-size:11px;font-weight:600;color:#8b949e;text-transform:uppercase;';
    header.textContent = 'Recent';
    
    // Emoji grid container with proper scrolling
    const scrollContainer = document.createElement('div');
    scrollContainer.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;';
    
    // Handle wheel events to enable scrolling and prevent propagation
    scrollContainer.addEventListener('wheel', (e) => {
      e.stopPropagation();
      // Allow natural scrolling within the container
    }, { passive: true });
    
    // Also prevent wheel events on the dropdown from bubbling
    dropdown.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });
    
    const emojiGrid = document.createElement('div');
    emojiGrid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:8px;';
    scrollContainer.appendChild(emojiGrid);
    
    // Helper: Save editor selection
    const saveSelection = () => {
      const editor = editorRef.current?.getInstance();
      if (editor) {
        try {
          const [start, end] = editor.getSelection();
          savedSelection = { start, end };
        } catch {
          savedSelection = null;
        }
      }
    };
    
    // Helper: Close dropdown
    const closeDropdown = () => {
      if (!isOpen) return;
      isOpen = false;
      dropdown.style.display = 'none';
    };
    
    // Helper: Insert emoji into editor
    const insertEmoji = (emoji: string) => {
      const editor = editorRef.current?.getInstance();
      if (editor) {
        try {
          editor.focus();
          if (savedSelection) {
            try { 
              editor.setSelection(savedSelection.start, savedSelection.end); 
            } catch {
              // Ignore selection error
            }
          }
          editor.insertText(emoji);
          addRecentEmoji(emoji);
        } catch {
          // Ignore insert error
        }
      }
      closeDropdown();
    };
    
    // Helper: Create emoji button
    const createEmojiBtn = (emoji: string): HTMLButtonElement => {
      const emojiBtn = document.createElement('button');
      emojiBtn.type = 'button';
      emojiBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:background 0.15s,transform 0.1s;display:flex;align-items:center;justify-content:center;width:34px;height:34px;';
      emojiBtn.dataset.emoji = emoji;
      
      const src = getEmojiImgSrc(emoji);
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = emoji;
        img.draggable = false;
        img.style.cssText = 'width:24px;height:24px;pointer-events:none;';
        emojiBtn.appendChild(img);
      } else {
        emojiBtn.textContent = emoji;
        emojiBtn.style.fontSize = '22px';
      }
      
      emojiBtn.addEventListener('mouseenter', () => {
        emojiBtn.style.background = '#3d444d';
        emojiBtn.style.transform = 'scale(1.15)';
      });
      emojiBtn.addEventListener('mouseleave', () => {
        emojiBtn.style.background = 'none';
        emojiBtn.style.transform = 'scale(1)';
      });
      
      // Simple click handler - dropdown pointerdown already prevents focus loss
      emojiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const emojiToInsert = emojiBtn.dataset.emoji || emoji;
        insertEmoji(emojiToInsert);
      });
      
      return emojiBtn;
    };
    
    // Helper: Render emojis
    const renderEmojis = (emojis: string[], label: string) => {
      emojiGrid.innerHTML = '';
      header.textContent = label;
      if (emojis.length === 0) {
        const noResults = document.createElement('div');
        noResults.style.cssText = 'grid-column:1/-1;text-align:center;color:#8b949e;padding:20px;font-size:14px;';
        noResults.textContent = label === 'Recent' ? 'No recent emojis' : 'No emojis found';
        emojiGrid.appendChild(noResults);
      } else {
        emojis.forEach(e => emojiGrid.appendChild(createEmojiBtn(e)));
      }
    };
    
    // Helper: Render category
    const renderCategory = (category: string) => {
      if (category === 'recent') {
        renderEmojis(getRecentEmojis(), 'Recent');
      } else if (EMOJI_CATEGORIES[category]) {
        renderEmojis(EMOJI_CATEGORIES[category].emojis, category);
      }
      scrollContainer.scrollTop = 0;
    };
    
    // Helper: Update tab styles
    const updateTabStyles = () => {
      tabButtons.forEach((tab, i) => {
        const cat = i === 0 ? 'recent' : CATEGORY_NAMES[i - 1];
        tab.style.background = cat === activeCategory ? '#3d444d' : 'none';
      });
    };
    
    // Helper: Select category
    const selectCategory = (category: string) => {
      activeCategory = category;
      searchInput.value = '';
      updateTabStyles();
      renderCategory(category);
    };
    
    // Helper: Create tab button
    const createTab = (emoji: string, title: string, isActive = false): HTMLButtonElement => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.style.cssText = `background:${isActive ? '#3d444d' : 'none'};border:none;cursor:pointer;padding:5px;border-radius:6px;display:flex;align-items:center;justify-content:center;`;
      tab.title = title;
      const src = getEmojiImgSrc(emoji);
      if (src) {
        tab.innerHTML = `<img src="${src}" alt="${emoji}" style="width:18px;height:18px;" draggable="false" />`;
      } else {
        tab.textContent = emoji;
        tab.style.fontSize = '14px';
      }
      
      // Add hover effect
      tab.addEventListener('mouseenter', () => {
        if (activeCategory !== title.toLowerCase() && title !== 'Recent') {
          tab.style.background = '#2d333b';
        }
      });
      tab.addEventListener('mouseleave', () => {
        const cat = title === 'Recent' ? 'recent' : title;
        tab.style.background = cat === activeCategory ? '#3d444d' : 'none';
      });
      
      return tab;
    };
    
    // Build tabs - Recent tab first
    const recentTab = createTab('🕐', 'Recent', true);
    recentTab.addEventListener('click', (e) => { 
      e.stopPropagation();
      selectCategory('recent'); 
    });
    tabButtons.push(recentTab);
    tabsContainer.appendChild(recentTab);
    
    // Category tabs
    CATEGORY_NAMES.forEach(category => {
      const tab = createTab(EMOJI_CATEGORIES[category].icon, category);
      tab.addEventListener('click', (e) => { 
        e.stopPropagation();
        selectCategory(category); 
      });
      tabButtons.push(tab);
      tabsContainer.appendChild(tab);
    });
    
    // Search functionality
    searchInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      if (!query) {
        activeCategory = 'recent';
        updateTabStyles();
        renderCategory('recent');
      } else {
        activeCategory = '';
        updateTabStyles();
        const filtered = allEmojis.filter(({ emoji }) => emoji.includes(query)).map(e => e.emoji);
        renderEmojis(filtered, `Search: "${query}"`);
      }
    });
    
    // Assemble dropdown
    dropdown.appendChild(searchContainer);
    dropdown.appendChild(tabsWrapper);
    dropdown.appendChild(header);
    dropdown.appendChild(scrollContainer);
    
    // Position dropdown
    const positionDropdown = () => {
      const rect = btn.getBoundingClientRect();
      const h = 420, w = 340;
      let top = rect.bottom + 4;
      if (top + h > window.innerHeight - 10) top = rect.top - h - 4;
      let left = rect.right - w;
      if (left < 10) left = 10;
      if (left + w > window.innerWidth - 10) left = window.innerWidth - w - 10;
      dropdown.style.top = `${Math.max(10, top)}px`;
      dropdown.style.left = `${left}px`;
    };
    
    // Open dropdown
    const openDropdown = () => {
      if (isOpen) return;
      isOpen = true;
      saveSelection();
      
      // Append dropdown to the nearest dialog portal or body
      // This ensures it's in the same stacking context as the dialog
      const dialogPortal = document.querySelector('[data-radix-portal]');
      const appendTarget = dialogPortal || document.body;
      if (!appendTarget.contains(dropdown)) {
        appendTarget.appendChild(dropdown);
      }
      
      positionDropdown();
      dropdown.style.display = 'flex';
      dropdown.style.pointerEvents = 'auto'; // Ensure pointer events work
      activeCategory = 'recent';
      searchInput.value = '';
      updateTabStyles();
      renderCategory('recent');
    };
    
    // Toolbar button click
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });
    
    // Close on outside mousedown - use direct contains() check
    const handleOutsideMousedown = (e: MouseEvent) => {
      if (!isOpen) return;
      
      const target = e.target as HTMLElement;
      
      // Direct check using the dropdown reference (works even when portalled)
      const inDropdown = dropdown.contains(target);
      const inWrapper = wrapper.contains(target);
      
      if (inDropdown || inWrapper) {
        return;
      }
      closeDropdown();
    };
    document.addEventListener('mousedown', handleOutsideMousedown, false); // Use bubble phase so dropdown can stopPropagation first
    
    // Don't append immediately - will be appended when opened to the correct portal
    // This ensures it's in the same stacking context as the dialog
    
    // Cleanup observer
    const observer = new MutationObserver(() => {
      if (!document.body.contains(wrapper) && !isOpen) {
        dropdown.remove();
        document.removeEventListener('mousedown', handleOutsideMousedown, false);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    wrapper.appendChild(btn);
    return wrapper;
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={cn(
        'border rounded-lg relative toastui-editor-wrapper flex flex-col',
        themeBackgroundColor ? 'toastui-themed' : 'bg-background',
        isDark ? 'toastui-dark' : 'toastui-light',
        className
      )}
      style={containerStyle}
    >
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
        toolbarItems={isMobileOrTablet ? [
          // Simplified mobile toolbar with fewer groups
          ['heading', 'bold', 'italic'],
          ['ul', 'ol', 'task'],
          [
            'link',
            { el: createEmojiToolbarItem(), tooltip: 'Insert Emoji', name: 'emoji' },
          ],
        ] : [
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          [
            'ul', 
            'ol', 
            'task', 
            { el: createIndentToolbarItem(), tooltip: 'Indent (Tab)', name: 'customIndent' },
            { el: createOutdentToolbarItem(), tooltip: 'Outdent (Shift+Tab)', name: 'customOutdent' },
          ],
          ['table', 'link'],
          ['code', 'codeblock'],
          [
            { el: createInlineButtonToolbarItem(), tooltip: 'Insert Inline Button', name: 'inlineButton' },
            { el: createEmojiToolbarItem(), tooltip: 'Insert Emoji', name: 'emoji' },
          ],
        ]}
      />
      
      <InlineButtonEditor
        open={showButtonEditor}
        onOpenChange={setShowButtonEditor}
        onSave={handleSaveButton}
        {...(editingEncodedData && { onDelete: handleDeleteButton })}
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
          border: none !important;
        }
        .toastui-editor-wrapper .toastui-editor-ww-mode .ProseMirror {
          min-height: 100px;
          max-height: calc(100vh - 400px);
          overflow-y: auto;
        }
        
        /* Custom indent/outdent toolbar buttons - match native ToastUI icons exactly */
        .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-indent,
        .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-outdent {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 32px !important;
          height: 32px !important;
          padding: 0 !important;
          margin: 0 !important;
          background: transparent !important;
          background-image: none !important;
          border: none !important;
          cursor: pointer !important;
        }
        .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-indent::before,
        .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-outdent::before {
          display: none !important;
        }
        .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-indent svg,
        .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-outdent svg {
          width: 16px !important;
          height: 16px !important;
          flex-shrink: 0;
        }
        
        /* Themed editor styles */
        .toastui-themed .toastui-editor-defaultUI {
          background: var(--editor-bg) !important;
        }
        .toastui-themed .toastui-editor-defaultUI-toolbar {
          border-bottom: 1px solid var(--editor-border) !important;
        }
        .toastui-themed .toastui-editor-ww-container {
          background: var(--editor-bg) !important;
        }
        .toastui-themed .toastui-editor-ww-mode .ProseMirror {
          background: var(--editor-bg) !important;
          color: var(--editor-text) !important;
        }
        .toastui-themed .toastui-editor-toolbar-icons {
          color: var(--editor-text) !important;
        }
        .toastui-themed .toastui-editor-contents p,
        .toastui-themed .toastui-editor-contents li,
        .toastui-themed .toastui-editor-contents h1,
        .toastui-themed .toastui-editor-contents h2,
        .toastui-themed .toastui-editor-contents h3,
        .toastui-themed .toastui-editor-contents h4,
        .toastui-themed .toastui-editor-contents h5,
        .toastui-themed .toastui-editor-contents h6 {
          color: var(--editor-text) !important;
        }
        .toastui-themed .toastui-editor-contents code {
          background: var(--editor-muted) !important;
          color: var(--editor-text) !important;
        }
        .toastui-themed .toastui-editor-contents pre {
          background: var(--editor-muted) !important;
        }
        .toastui-themed .toastui-editor-contents blockquote {
          border-left-color: var(--editor-border) !important;
          color: var(--editor-text) !important;
          opacity: 0.8;
        }
        .toastui-themed .toastui-editor-contents hr {
          border-color: var(--editor-border) !important;
        }
        .toastui-themed .toastui-editor-contents table th,
        .toastui-themed .toastui-editor-contents table td {
          border-color: var(--editor-border) !important;
        }
        .toastui-themed .toastui-editor-contents table th {
          background: var(--editor-muted) !important;
        }
        
        /* Dark theme - invert toolbar icons */
        .toastui-themed.toastui-dark .toastui-editor-toolbar-icons::before {
          filter: invert(1) !important;
        }
        
        /* Non-themed fallback styles */
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-defaultUI {
          background: hsl(var(--card)) !important;
        }
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-defaultUI-toolbar {
          border-bottom: 1px solid hsl(var(--border)) !important;
        }
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-ww-container {
          background: hsl(var(--card)) !important;
        }
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-ww-mode .ProseMirror {
          background: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
        }
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-toolbar-icons {
          color: hsl(var(--foreground)) !important;
        }
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents p,
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents li,
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents h1,
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents h2,
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents h3,
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents h4,
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents h5,
        .toastui-editor-wrapper:not(.toastui-themed) .toastui-editor-contents h6 {
          color: hsl(var(--foreground)) !important;
        }
        
        /* Twemoji styles for consistent emoji rendering */
        .toastui-editor-wrapper .twemoji-editor {
          display: inline-block;
          width: 1.2em;
          height: 1.2em;
          vertical-align: -0.2em;
          margin: 0 0.05em;
        }
        
        /* Mobile toolbar styles - larger touch targets */
        @media (max-width: 1024px) {
          .toastui-editor-wrapper .toastui-editor-toolbar-icons {
            min-width: 44px !important;
            min-height: 44px !important;
            width: 44px !important;
            height: 44px !important;
            padding: 10px !important;
            margin: 2px !important;
          }
          .toastui-editor-wrapper .toastui-editor-toolbar-icons::before {
            transform: scale(1.25) !important;
          }
          .toastui-editor-wrapper .toastui-editor-defaultUI-toolbar {
            padding: 8px 4px !important;
            gap: 4px;
            flex-wrap: wrap;
          }
          .toastui-editor-wrapper .toastui-editor-toolbar-group {
            padding: 0 4px !important;
            gap: 4px;
          }
          .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-indent svg,
          .toastui-editor-wrapper .toastui-editor-toolbar-icons.custom-outdent svg {
            width: 20px !important;
            height: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}
