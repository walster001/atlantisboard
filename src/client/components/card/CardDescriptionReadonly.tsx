import { memo, useMemo } from 'react';
import { generateJSON } from '@tiptap/html';
import { renderToReactElement } from '@tiptap/static-renderer';
import { sanitizeHtml } from '../../../shared/utils/sanitizeHtml.js';
import {
  getCardDescriptionExtensions,
  isCardDescriptionEmpty,
  parseCardDescriptionJson,
} from './cardDescriptionTiptap.js';
import { renderCardDescriptionTwemojiStaticNode } from './twemojiStaticNodeRender.js';
import { renderCardDescriptionAudioStaticNode } from './cardDescriptionAudioStaticNode.js';
import { renderCardDescriptionVideoStaticNode } from './cardDescriptionVideoStaticNode.js';
import './cardDescriptionTiptap.css';

export interface CardDescriptionReadonlyProps {
  valueJson: string | undefined | null;
  valueHtml?: string | undefined;
}

function legacyHtmlToDescriptionDoc(valueHtml: string) {
  const sanitized = sanitizeHtml(valueHtml);
  if (sanitized === '') {
    return null;
  }
  try {
    const doc = generateJSON(sanitized, getCardDescriptionExtensions());
    return isCardDescriptionEmpty(doc) ? null : doc;
  } catch {
    return null;
  }
}

function CardDescriptionReadonlyInner({ valueJson, valueHtml }: CardDescriptionReadonlyProps) {
  const rendered = useMemo(() => {
    let doc = parseCardDescriptionJson(valueJson);
    if (isCardDescriptionEmpty(doc) && typeof valueHtml === 'string' && valueHtml.trim() !== '') {
      const migrated = legacyHtmlToDescriptionDoc(valueHtml);
      if (migrated != null) {
        doc = migrated;
      }
    }
    if (isCardDescriptionEmpty(doc)) {
      return null;
    }
    return renderToReactElement({
      content: doc,
      extensions: getCardDescriptionExtensions(),
      options: {
        nodeMapping: {
          twemojiEmoji: renderCardDescriptionTwemojiStaticNode,
          video: renderCardDescriptionVideoStaticNode,
          audio: renderCardDescriptionAudioStaticNode,
        },
      },
    });
  }, [valueJson, valueHtml]);

  if (rendered == null) {
    return null;
  }

  return (
    <div className="card-desc-tiptap-read card-desc-tiptap-read--detail">{rendered}</div>
  );
}

/** Static render only — no ProseMirror editor; memoized to avoid re-running the static renderer on unrelated parent updates. */
export const CardDescriptionReadonly = memo(CardDescriptionReadonlyInner);
