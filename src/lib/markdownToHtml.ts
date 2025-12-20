import { marked } from 'marked';

// Configure marked for safe HTML output with proper line break handling
marked.setOptions({
  breaks: true, // Convert \n to <br> - important for preserving line spacing
  gfm: true, // GitHub Flavored Markdown
});

/**
 * Convert Markdown to HTML for TipTap editor
 * Preserves formatting, colors, links, code blocks, paragraph and line spacing, etc.
 */
export function markdownToHtml(markdown: string | null | undefined): string {
  if (!markdown) return '';
  
  // Check if content is already HTML (starts with a tag)
  const trimmed = markdown.trim();
  if (trimmed.startsWith('<') && (
    trimmed.startsWith('<p>') || 
    trimmed.startsWith('<h') || 
    trimmed.startsWith('<ul>') || 
    trimmed.startsWith('<ol>') || 
    trimmed.startsWith('<div>') ||
    trimmed.startsWith('<blockquote>') ||
    trimmed.startsWith('<pre>')
  )) {
    return markdown;
  }
  
  try {
    // Convert markdown to HTML using marked with breaks enabled
    let html = marked.parse(markdown, { async: false }) as string;
    
    // Preserve inline HTML that might be in the markdown
    // (some Wekan/Trello exports include HTML tags)
    
    // Convert color spans if present (Wekan format)
    // Example: {color:red}text{color} -> <span style="color: red">text</span>
    html = html.replace(
      /\{color:([^}]+)\}([^{]*)\{color\}/g, 
      '<span style="color: $1">$2</span>'
    );
    
    return html;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    // Fallback: wrap plain text in paragraph tags, preserving line breaks
    return `<p>${markdown.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  }
}

/**
 * Sanitize HTML content while preserving safe formatting
 */
export function sanitizeHtml(html: string): string {
  // Allow safe tags and attributes
  const allowedTags = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'span', 'div',
    'hr', 'img'
  ];
  
  const allowedAttributes = ['href', 'src', 'alt', 'style', 'class', 'target'];
  
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Remove script tags and event handlers
  const scripts = tempDiv.querySelectorAll('script');
  scripts.forEach(s => s.remove());
  
  // Remove event handlers from all elements
  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove event handler attributes
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  
  return tempDiv.innerHTML;
}
