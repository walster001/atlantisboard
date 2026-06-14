import type { Node as PMNode } from '@tiptap/pm/model';
import { createElement } from 'react';
import { CardDescriptionReadonlyAudio } from './cardDescriptionReadonlyAudio.js';
import { readAudioDisplayAttrs } from './tiptapAudioDisplay.js';
import { audioLayoutShellStyle, readAudioLayoutFromAttrs } from './tiptapAudioLayout.js';

export function renderCardDescriptionAudioStaticNode({ node }: { readonly node: PMNode }) {
  const attrs = node.attrs as Record<string, unknown>;
  const src = typeof attrs.src === 'string' ? attrs.src.trim() : '';
  if (src === '') {
    return null;
  }
  const display = readAudioDisplayAttrs(attrs);
  const layout = readAudioLayoutFromAttrs(attrs);
  const hasExplicitLayout = layout.widthPx != null || layout.heightPx != null;
  return createElement(
    'div',
    {
      className: hasExplicitLayout
        ? 'card-desc-audio-resize-container card-desc-audio-layout-shell'
        : 'card-desc-audio-layout-shell',
      style: audioLayoutShellStyle(attrs),
    },
    createElement(CardDescriptionReadonlyAudio, {
      src,
      displayTitle: display.displayTitle,
      displayDescription: display.displayDescription,
      coverSrc: display.coverSrc,
      textColor: display.textColor,
      bgColor: display.bgColor,
      buttonHoverColor: display.buttonHoverColor,
      interactive: true,
      className: 'card-desc-audio-player',
      shellClassName: 'card-desc-audio-player-inner',
      shellLayoutStyle: { width: '100%', height: '100%', minHeight: 0 },
      isolateDescriptionClicks: true,
    }),
  );
}
