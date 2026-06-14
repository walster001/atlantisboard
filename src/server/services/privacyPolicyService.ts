import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import { PRIVACY_POLICY_VERSION } from '../../shared/legal/privacyPolicy.js';
import { sanitizeHtml } from '../utils/sanitizeHtml.js';

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

let cachedMarkdown: string | null = null;

async function loadPrivacyPolicyMarkdown(): Promise<string> {
  if (cachedMarkdown !== null) {
    return cachedMarkdown;
  }
  const filePath = join(process.cwd(), 'public', 'legal', 'privacy-policy.md');
  cachedMarkdown = await readFile(filePath, 'utf8');
  return cachedMarkdown;
}

export async function getPublicPrivacyPolicyDocument(): Promise<{
  version: string;
  markdown: string;
  html: string;
}> {
  const markdown = await loadPrivacyPolicyMarkdown();
  const rawHtml = markdownRenderer.render(markdown);
  const html = sanitizeHtml(rawHtml);
  return {
    version: PRIVACY_POLICY_VERSION,
    markdown,
    html,
  };
}
