function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderCardDescriptionHtml(description: string | undefined): string {
  if (description == null || description.trim() === '') {
    return '';
  }

  try {
    const parsed = JSON.parse(description) as {
      content?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const blocks = Array.isArray(parsed.content) ? parsed.content : [];
    const lines = blocks
      .map((node) => {
        const chunks = Array.isArray(node.content) ? node.content : [];
        const text = chunks
          .map((chunk) => (typeof chunk.text === 'string' ? chunk.text : ''))
          .join('');
        return text.trim();
      })
      .filter((line) => line !== '');
    if (lines.length === 0) {
      return '';
    }
    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  } catch {
    const safe = escapeHtml(description.trim());
    return safe === '' ? '' : `<p>${safe}</p>`;
  }
}
