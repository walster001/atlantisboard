import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCardAttachmentMaxBytes } from '../constants/uploads.js';

let cachedTemplate: string | null = null;

function loadIndexTemplate(): string {
  if (cachedTemplate === null) {
    cachedTemplate = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8');
  }
  return cachedTemplate;
}

const UPLOAD_LIMITS_META_NAME = 'kanboard-upload-limits';

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Inject per-request CSP nonce meta for client-side style tags (e.g. custom webfonts). */
export function renderSpaIndexHtml(cspNonce: string): string {
  const escaped = cspNonce.replace(/"/g, '&quot;');
  const meta = `<meta name="csp-nonce" content="${escaped}" />`;
  const limitsPayload = escapeHtmlAttribute(
    JSON.stringify({ cardAttachmentMaxBytes: getCardAttachmentMaxBytes() }),
  );
  const limitsMeta = `<meta name="${UPLOAD_LIMITS_META_NAME}" content="${limitsPayload}" />`;
  const template = loadIndexTemplate();
  let html = template;
  if (html.includes('name="csp-nonce"')) {
    html = html.replace(/<meta name="csp-nonce" content="[^"]*" \/>/, meta);
  } else {
    html = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${meta}`);
  }
  if (html.includes(`name="${UPLOAD_LIMITS_META_NAME}"`)) {
    return html.replace(
      new RegExp(`<meta name="${UPLOAD_LIMITS_META_NAME}" content="[^"]*" \\/>`),
      limitsMeta,
    );
  }
  return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${limitsMeta}`);
}
