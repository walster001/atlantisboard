import { memo, useMemo } from 'react';
import { renderToReactElement } from '@tiptap/static-renderer';
import {
  getCardDescriptionExtensions,
  isCardDescriptionEmpty,
  parseCardDescriptionJson,
} from './cardDescriptionTiptap.js';
import './cardDescriptionTiptap.css';

export interface CardDescriptionReadonlyProps {
  valueJson: string | undefined | null;
  valueHtml?: string | undefined;
}

function CardDescriptionReadonlyInner({ valueJson, valueHtml }: CardDescriptionReadonlyProps) {
  const fromJson = useMemo(() => {
    const doc = parseCardDescriptionJson(valueJson);
    if (isCardDescriptionEmpty(doc)) {
      return null;
    }
    return renderToReactElement({
      content: doc,
      extensions: getCardDescriptionExtensions(),
    });
  }, [valueJson]);

  if (fromJson != null) {
    return (
      <div className="card-desc-tiptap-read card-desc-tiptap-read--detail">{fromJson}</div>
    );
  }
  if (typeof valueHtml === 'string' && valueHtml.trim() !== '') {
    return (
      <div
        className="card-desc-tiptap-read card-desc-tiptap-read--detail"
        dangerouslySetInnerHTML={{ __html: valueHtml }}
      />
    );
  }
  return null;
}

/** Static render only — no ProseMirror editor; memoized to avoid re-running the static renderer on unrelated parent updates. */
export const CardDescriptionReadonly = memo(CardDescriptionReadonlyInner);
