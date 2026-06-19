export function extractPlainTextFromRichJsonNode(node: unknown): string {
  if (node == null || typeof node !== 'object') {
    return '';
  }
  const obj = node as { type?: unknown; text?: unknown; content?: unknown; attrs?: unknown };
  if (obj.type === 'inlineButton' && obj.attrs != null && typeof obj.attrs === 'object') {
    const btn = (obj.attrs as { buttonText?: unknown }).buttonText;
    if (typeof btn === 'string' && btn.trim() !== '') {
      return btn.trim();
    }
    return '';
  }
  if (obj.type === 'twemojiEmoji' && obj.attrs != null && typeof obj.attrs === 'object') {
    const emoji = (obj.attrs as { emoji?: unknown }).emoji;
    if (typeof emoji === 'string' && emoji.trim() !== '') {
      return emoji;
    }
  }
  const selfText = typeof obj.text === 'string' ? obj.text : '';
  const children = Array.isArray(obj.content)
    ? obj.content.map((child) => extractPlainTextFromRichJsonNode(child)).join(' ')
    : '';
  return `${selfText} ${children}`.trim();
}

export function extractPlainDescription(description: string | undefined): string {
  if (description == null || description.trim() === '') {
    return '';
  }
  try {
    const parsed = JSON.parse(description) as unknown;
    return extractPlainTextFromRichJsonNode(parsed)
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return description.replace(/\s+/g, ' ').trim();
  }
}
