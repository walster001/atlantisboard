import { renderToReactElement } from '@tiptap/static-renderer';
import {
  getCardDescriptionExtensions,
  isCardDescriptionEmpty,
  parseCardDescriptionJson,
  stripInlineButtonsForBoardPreview,
} from './cardDescriptionTiptap.js';
import { renderCardDescriptionTwemojiStaticNode } from './twemojiStaticNodeRender.js';
import './cardDescriptionTiptap.css';

export interface CardDescriptionBoardPreviewProps {
  readonly valueJson: string | undefined | null;
}

/** Kanban card body: rich description (Twemoji, etc.) in a height-clamped preview. */
export function CardDescriptionBoardPreview({ valueJson }: CardDescriptionBoardPreviewProps) {
  const docRaw = parseCardDescriptionJson(valueJson);
  if (isCardDescriptionEmpty(docRaw)) {
    return null;
  }
  const doc = stripInlineButtonsForBoardPreview(docRaw);
  if (isCardDescriptionEmpty(doc)) {
    return null;
  }
  return renderToReactElement({
    content: doc,
    extensions: getCardDescriptionExtensions(),
    options: {
      nodeMapping: {
        twemojiEmoji: renderCardDescriptionTwemojiStaticNode,
      },
    },
  });
}
