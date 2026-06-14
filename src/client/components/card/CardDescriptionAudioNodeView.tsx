import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useMemo } from 'react';
import { CardDescriptionAudioPodcastSkeleton } from './CardDescriptionAudioPodcastSkeleton.js';
import { CardDescriptionAudioResizeChrome } from './CardDescriptionAudioResizeChrome.js';
import { readAudioDisplayAttrs } from './tiptapAudioDisplay.js';
import { useCardDescriptionAudioNodeViewLayout } from './useCardDescriptionAudioNodeViewLayout.js';

export function CardDescriptionAudioNodeView({
  node,
  editor,
  getPos,
}: NodeViewProps) {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src.trim() : '';
  const display = useMemo(
    () => readAudioDisplayAttrs(node.attrs as Record<string, unknown>),
    [node.attrs],
  );
  const editable = editor.isEditable;
  const {
    containerRef,
    resizeActive,
    isPointerDragging,
    containerLayoutStyle,
    startResize,
    handleContainerPointerDown,
    handleContainerClick,
    handleMoveHandlePointerDown,
    handleMoveHandleTouchStart,
    handleNodePointerDownCapture,
    handleContainerDoubleClick,
  } = useCardDescriptionAudioNodeViewLayout({ node, editor, getPos });

  if (src === '') {
    return null;
  }

  return (
    <NodeViewWrapper
      as="div"
      className="card-desc-audio-node-view"
      contentEditable={false}
      onPointerDownCapture={handleNodePointerDownCapture}
    >
      <div
        ref={containerRef}
        className="card-desc-audio-resize-container card-desc-audio-layout-shell"
        {...(isPointerDragging ? {} : { style: containerLayoutStyle })}
        onPointerDown={handleContainerPointerDown}
        onClick={handleContainerClick}
        onDoubleClick={handleContainerDoubleClick}
        {...(editable ? { title: 'Double-click to edit appearance' } : {})}
      >
        {resizeActive && editable ? (
          <CardDescriptionAudioResizeChrome
            onMoveHandlePointerDown={handleMoveHandlePointerDown}
            onMoveHandleTouchStart={handleMoveHandleTouchStart}
            onResizePointerDown={startResize}
          />
        ) : null}
        <CardDescriptionAudioPodcastSkeleton
          displayTitle={display.displayTitle}
          displayDescription={display.displayDescription}
          coverSrc={display.coverSrc}
          textColor={display.textColor}
          bgColor={display.bgColor}
          buttonHoverColor={display.buttonHoverColor}
        />
      </div>
    </NodeViewWrapper>
  );
}
