import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cachedTemplate: string | null = null;

function loadIndexTemplate(): string {
  if (cachedTemplate === null) {
    cachedTemplate = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8');
  }
  return cachedTemplate;
}

/** Inject per-request CSP nonce meta for client-side style tags (e.g. custom webfonts). */
export function renderSpaIndexHtml(cspNonce: string): string {
  const escaped = cspNonce.replace(/"/g, '&quot;');
  const meta = `<meta name="csp-nonce" content="${escaped}" />`;
  const template = loadIndexTemplate();
  if (template.includes('name="csp-nonce"')) {
    return template.replace(/<meta name="csp-nonce" content="[^"]*" \/>/, meta);
  }
  return template.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${meta}`);
}
