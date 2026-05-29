import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { CardDescriptionVideoPlayer } from './CardDescriptionVideoPlayer.js';

export function CardDescriptionVideoNodeView({ node }: NodeViewProps) {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src.trim() : '';
  const poster =
    typeof node.attrs.poster === 'string' && node.attrs.poster.trim() !== ''
      ? node.attrs.poster.trim()
      : undefined;

  if (src === '') {
    return null;
  }

  return (
    <NodeViewWrapper className="card-desc-video-node-view" data-drag-handle>
      <CardDescriptionVideoPlayer src={src} poster={poster} className="card-desc-video-player" />
    </NodeViewWrapper>
  );
}
