/**
 * MarkdownRenderer.tsx
 * 
 * A secure React component that renders Markdown content without using dangerouslySetInnerHTML.
 * 
 * Features:
 * - Safely renders Markdown including tables, task lists, and strikethrough (GFM)
 * - Converts emoji shortcodes (e.g., :smile:) to Unicode emojis
 * - Ensures all links open in a new tab with rel="noopener noreferrer"
 * - Sanitizes any HTML in the input to prevent XSS attacks
 * - Renders inline buttons with proper styling and click-to-navigate functionality
 * 
 * This component uses react-markdown with:
 * - remark-gfm: GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - remark-emoji: Convert emoji shortcodes to Unicode
 * - rehype-sanitize: Prevent XSS by sanitizing HTML
 */

import { useMemo, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import { parseInlineButtonFromDataAttr, type InlineButtonData } from './InlineButtonEditor';
import { observeTwemoji } from '@/lib/twemojiUtils';

// ============================================================================
// Types
// ============================================================================

interface MarkdownRendererProps {
  /** Markdown content to render */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Theme text color for custom styling */
  themeTextColor?: string;
  /** Theme background color for contrast calculations */
  themeBackgroundColor?: string;
  /** Called when an inline button is clicked */
  onInlineButtonClick?: (data: InlineButtonData) => void;
  /** Called when the content area is clicked (for edit mode) */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

// ============================================================================
// Inline Button Detection & Parsing
// ============================================================================

/**
 * Regex to detect our serialized inline button format in the content.
 * Matches: [INLINE_BUTTON:base64EncodedData]
 */
const INLINE_BUTTON_MARKDOWN_REGEX = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g;

/**
 * Component to render an inline button within markdown content.
 * Handles click events to navigate to the button's URL.
 */
interface InlineButtonProps {
  data: InlineButtonData;
  onClick?: (data: InlineButtonData) => void;
}

const DEFAULT_BORDER_RADIUS = 4;

function InlineButton({ data, onClick }: InlineButtonProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onClick) {
      onClick(data);
    } else if (data.linkUrl) {
      // Default behavior: open link in new tab
      const url = data.linkUrl.startsWith('http') ? data.linkUrl : `https://${data.linkUrl}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [data, onClick]);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e as any)}
      className="inline-flex items-center gap-1 px-2 py-1 text-sm cursor-pointer transition-all hover:opacity-85 hover:-translate-y-0.5 my-0.5 mx-0.5"
      style={{
        backgroundColor: data.backgroundColor || '#1D2125',
        color: data.textColor || '#579DFF',
        border: '1px solid #3d444d',
        borderRadius: `${data.borderRadius ?? DEFAULT_BORDER_RADIUS}px`,
        verticalAlign: 'middle',
      }}
    >
      {data.iconUrl && (
        <img
          src={data.iconUrl}
          alt=""
          style={{
            width: data.iconSize || 16,
            height: data.iconSize || 16,
          }}
          className="object-contain flex-shrink-0"
        />
      )}
      <span>{data.linkText || 'Button'}</span>
    </span>
  );
}

// ============================================================================
// Sanitization Schema
// ============================================================================

/**
 * Extended sanitization schema that allows our inline button elements
 * while still preventing XSS attacks.
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // Allow basic formatting tags
    'span', 'div', 'img', 'a',
  ],
  attributes: {
    ...defaultSchema.attributes,
    // Allow data attributes for inline buttons
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className', /^inline-button/],
      'data-inline-button',
      'data-bg-color',
      'data-text-color',
      'data-link-url',
      'style',
    ],
    img: [
      ...(defaultSchema.attributes?.img || []),
      'src', 'alt', 'width', 'height', 'style',
    ],
    a: [
      ...(defaultSchema.attributes?.a || []),
      'href', 'target', 'rel', 'style',
    ],
    // Allow styling on various elements
    '*': [
      ...(defaultSchema.attributes?.['*'] || []),
      'className', 'class',
    ],
  },
};

// ============================================================================
// Content Pre-processing
// ============================================================================

/**
 * Converts legacy HTML inline buttons to our new markdown format.
 * Handles multiple formats:
 * 1. Our editable-inline-button format with data-inline-button attribute
 * 2. Original Wekan format: <span style="display:inline-flex"><img><a>text</a></span>
 * 3. Already converted [INLINE_BUTTON:...] format (pass through)
 */
function convertLegacyInlineButtons(content: string): string {
  if (!content) return content;
  
  let result = content;
  
  // Skip if no HTML-like content and no legacy formats
  if (!result.includes('<span') && !result.includes('<a')) {
    return result;
  }
  
  // Pattern 1: Match our editable-inline-button spans with data attributes
  const editableButtonRegex = /<span[^>]*class="[^"]*editable-inline-button[^"]*"[^>]*data-inline-button="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi;
  result = result.replace(editableButtonRegex, (_match, dataAttr) => {
    return `[INLINE_BUTTON:${dataAttr}]`;
  });
  
  // Pattern 2: Match original Wekan inline button format
  // <span style="...display:inline-flex..."><img src="..."><a href="...">text</a></span>
  const wekanButtonRegex = /<span[^>]*style=['"][^'"]*display\s*:\s*inline-?flex[^'"]*['"][^>]*>([\s\S]*?)<\/span>/gi;
  result = result.replace(wekanButtonRegex, (match, innerHtml) => {
    // Skip if already converted
    if (match.includes('INLINE_BUTTON:')) return match;
    
    // Extract components from inner HTML
    const imgMatch = innerHtml.match(/<img[^>]*src=['"]([^'"]+)['"][^>]*>/i);
    const anchorMatch = innerHtml.match(/<a[^>]*href=['"]([^'"]+)['"][^>]*>([^<]*)<\/a>/i);
    const bgColorMatch = match.match(/background(?:-color)?:\s*([^;'"]+)/i);
    const textColorMatch = innerHtml.match(/(?:^|[^-])color:\s*([^;'"]+)/i) || match.match(/(?:^|[^-])color:\s*([^;'"]+)/i);
    
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
      
      // Serialize to our markdown format
      const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      return `[INLINE_BUTTON:${encodedData}]`;
    }
    
    return match;
  });
  
  return result;
}

/**
 * Detects if content contains raw HTML that should be converted to Markdown.
 * Returns true if content appears to be HTML-formatted.
 */
function isHtmlContent(content: string): boolean {
  const trimmed = content.trim();
  
  // Check for common HTML starting patterns
  if (trimmed.startsWith('<') && (
    trimmed.startsWith('<p>') ||
    trimmed.startsWith('<p ') ||
    trimmed.startsWith('<h') ||
    trimmed.startsWith('<ul') ||
    trimmed.startsWith('<ol') ||
    trimmed.startsWith('<div') ||
    trimmed.startsWith('<blockquote') ||
    trimmed.startsWith('<pre') ||
    trimmed.startsWith('<span')
  )) {
    return true;
  }
  
  // Also check if content contains significant HTML tags
  const htmlTagPattern = /<(p|h[1-6]|ul|ol|li|div|blockquote|pre|strong|em|a|span|br)\b[^>]*>/i;
  return htmlTagPattern.test(content);
}

/**
 * Convert HTML content to Markdown for safe rendering.
 * This handles legacy HTML descriptions from imports.
 */
function htmlToMarkdown(html: string): string {
  if (!html) return '';
  
  let md = html;
  
  // First, convert inline buttons to our format
  md = convertLegacyInlineButtons(md);
  
  // Convert headers
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n');
  
  // Convert text formatting
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  md = md.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');
  md = md.replace(/<strike[^>]*>([\s\S]*?)<\/strike>/gi, '~~$1~~');
  md = md.replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~');
  
  // Convert code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```');
  
  // Convert lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n') + '\n';
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let index = 0;
    return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, () => {
      index++;
      return `${index}. $1\n`;
    }) + '\n';
  });
  
  // Convert links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  
  // Convert blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    return content.split('\n').map((line: string) => `> ${line}`).join('\n') + '\n';
  });
  
  // Convert horizontal rules
  md = md.replace(/<hr[^/]*\/>/gi, '\n---\n');
  
  // Convert line breaks - preserve spacing
  md = md.replace(/<br\s*\/?>/gi, '  \n');
  
  // Convert paragraphs (preserve spacing with double newlines)
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  
  // Remove remaining HTML tags (safety measure) but preserve content
  md = md.replace(/<[^>]+>/g, '');
  
  // Clean up excessive newlines but preserve paragraph spacing
  md = md.replace(/\n{4,}/g, '\n\n\n');
  md = md.replace(/^\n+/, ''); // Remove leading newlines
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  return md.trim();
}

// ============================================================================
// Main Component
// ============================================================================

export function MarkdownRenderer({
  content,
  className,
  themeTextColor,
  themeBackgroundColor,
  onInlineButtonClick,
  onClick,
}: MarkdownRendererProps) {
  /**
   * Pre-process the content:
   * 1. Convert legacy HTML to Markdown if needed
   * 2. Convert legacy inline buttons to our new format
   */
  const processedContent = useMemo(() => {
    if (!content) return '';
    
    let processed = content;
    
    // If content is HTML, convert to Markdown
    if (isHtmlContent(processed)) {
      processed = htmlToMarkdown(processed);
    } else {
      // Just convert any inline buttons
      processed = convertLegacyInlineButtons(processed);
    }
    
    return processed;
  }, [content]);

  /**
   * Parse inline buttons from the content and render them as React components.
   * Returns an array of content segments with inline button data.
   */
  const contentSegments = useMemo(() => {
    if (!processedContent) return [];
    
    const segments: Array<{ type: 'text' | 'button'; content: string; data?: InlineButtonData }> = [];
    let lastIndex = 0;
    
    // Reset regex state
    INLINE_BUTTON_MARKDOWN_REGEX.lastIndex = 0;
    
    let match;
    while ((match = INLINE_BUTTON_MARKDOWN_REGEX.exec(processedContent)) !== null) {
      // Add text before this button
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: processedContent.slice(lastIndex, match.index),
        });
      }
      
      // Add the button
      const buttonData = parseInlineButtonFromDataAttr(match[1]);
      if (buttonData) {
        segments.push({
          type: 'button',
          content: match[0],
          data: buttonData,
        });
      } else {
        // Failed to parse, keep as text
        segments.push({
          type: 'text',
          content: match[0],
        });
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < processedContent.length) {
      segments.push({
        type: 'text',
        content: processedContent.slice(lastIndex),
      });
    }
    
    return segments;
  }, [processedContent]);

  /**
   * Custom link renderer that opens all links in a new tab
   * with proper security attributes.
   */
  const LinkRenderer = useCallback(({ href, children, ...props }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline hover:text-primary/80"
      {...props}
    >
      {children}
    </a>
  ), []);

  /**
   * Custom checkbox renderer for task lists.
   */
  const CheckboxRenderer = useCallback(({ checked, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      disabled
      className="mr-2 rounded border-border"
      {...props}
    />
  ), []);

  /**
   * Custom code renderer with proper styling.
   */
  const CodeRenderer = useCallback(({ inline, className: codeClassName, children, ...props }: any) => {
    if (inline) {
      return (
        <code
          className={cn(
            'px-1 py-0.5 rounded text-xs bg-muted/70',
            themeBackgroundColor && 'bg-black/10',
          )}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <pre
        className={cn(
          'p-3 rounded-md overflow-x-auto font-mono text-xs bg-muted',
          themeBackgroundColor && 'bg-black/10',
        )}
      >
        <code className={codeClassName} {...props}>
          {children}
        </code>
      </pre>
    );
  }, [themeBackgroundColor]);

  /**
   * Custom table renderer with proper styling.
   */
  const TableRenderer = useCallback(({ children, ...props }: any) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse border border-border" {...props}>
        {children}
      </table>
    </div>
  ), []);

  const TableCellRenderer = useCallback(({ children, isHeader, ...props }: any) => {
    const Tag = isHeader ? 'th' : 'td';
    return (
      <Tag
        className={cn(
          'border border-border px-3 py-2 text-left',
          isHeader && 'bg-muted/50 font-medium',
        )}
        {...props}
      >
        {children}
      </Tag>
    );
  }, []);

  // Handle container click for edit mode
  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(e);
  }, [onClick]);

  // Ref for the container to apply Twemoji parsing
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Apply Twemoji parsing using MutationObserver
  // This automatically re-parses when ReactMarkdown recreates DOM nodes
  useEffect(() => {
    const cleanup = observeTwemoji(containerRef.current, 'twemoji-inline');
    return cleanup;
  }, [processedContent]); // Re-attach when content changes

  // If no content, return null
  if (!content) return null;

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={cn(
        'markdown-renderer',
        className,
      )}
      style={themeTextColor ? { color: themeTextColor } : undefined}
    >
      {/* 
        Render each segment:
        - Text segments are rendered with ReactMarkdown
        - Button segments are rendered as InlineButton components
      */}
      {contentSegments.map((segment, index) => {
        if (segment.type === 'button' && segment.data) {
          return (
            <InlineButton
              key={`btn-${index}`}
              data={segment.data}
              onClick={onInlineButtonClick}
            />
          );
        }
        
        return (
          <ReactMarkdown
            key={`md-${index}`}
            remarkPlugins={[
              // GitHub Flavored Markdown: tables, strikethrough, task lists, autolinks
              remarkGfm,
              // Convert emoji shortcodes like :smile: to Unicode
              remarkEmoji,
            ]}
            rehypePlugins={[
              // Sanitize HTML to prevent XSS attacks
              [rehypeSanitize, sanitizeSchema],
            ]}
            components={{
              // Custom link renderer for security
              a: LinkRenderer,
              // Custom checkbox for task lists
              input: CheckboxRenderer,
              // Custom code renderer
              code: CodeRenderer,
              // Custom table renderer
              table: TableRenderer,
              th: (props) => <TableCellRenderer {...props} isHeader />,
              td: TableCellRenderer,
              // Style headings
              h1: ({ children }) => <h1 className="text-xl font-bold mt-3 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-semibold mt-2 mb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
              // Style paragraphs with proper spacing
              p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
              // Style lists with proper spacing
              ul: ({ children }) => <ul className="list-disc pl-5 my-3 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 my-3 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="my-1 leading-relaxed">{children}</li>,
              // Style blockquotes
              blockquote: ({ children }) => (
                <blockquote
                  className={cn(
                    'border-l-2 pl-3 my-2 opacity-80',
                    !themeBackgroundColor && 'border-border',
                    themeBackgroundColor && 'border-current',
                  )}
                >
                  {children}
                </blockquote>
              ),
              // Style horizontal rules
              hr: () => <hr className="my-4 border-border" />,
            }}
          >
            {segment.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

export default MarkdownRenderer;
