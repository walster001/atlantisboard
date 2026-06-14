import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';
import { getCardDescriptionAudioResizeDotStyles } from './cardDescriptionAudioResizeDots.js';

export interface CardDescriptionAudioResizeChromeProps {
  readonly onMoveHandlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onMoveHandleTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  readonly onResizePointerDown: (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function CardDescriptionAudioResizeChrome({
  onMoveHandlePointerDown,
  onMoveHandleTouchStart,
  onResizePointerDown,
}: CardDescriptionAudioResizeChromeProps) {
  return (
    <>
      <div
        className="card-desc-audio-move-handle"
        data-drag-handle
        title="Drag to reorder"
        onPointerDown={onMoveHandlePointerDown}
        onTouchStart={onMoveHandleTouchStart}
      />
      {getCardDescriptionAudioResizeDotStyles().map((dotStyle, index) => (
        <div
          key={index}
          role="presentation"
          style={dotStyle}
          onPointerDown={onResizePointerDown(index)}
        />
      ))}
    </>
  );
}
