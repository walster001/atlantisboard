import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface CardDescriptionPodcastVerticalVolumeSliderProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly onDragChange?: (dragging: boolean) => void;
}

/** iOS may synthesize a click/pointerdown after touchend; ignore brief window. */
const POST_DRAG_SUPPRESS_MS = 400;

function clampVolumePercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function CardDescriptionPodcastVerticalVolumeSlider({
  value,
  onChange,
  onDragChange,
}: CardDescriptionPodcastVerticalVolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onDragChangeRef = useRef(onDragChange);
  const dragActiveRef = useRef(false);
  const suppressPointerUntilRef = useRef(0);
  const [dragValue, setDragValue] = useState<number | null>(null);

  onChangeRef.current = onChange;
  onDragChangeRef.current = onDragChange;

  const valueFromClientY = useCallback((clientY: number): number => {
    const track = trackRef.current;
    if (track == null) {
      return 0;
    }
    const rect = track.getBoundingClientRect();
    if (rect.height <= 0) {
      return 0;
    }
    const ratio = 1 - (clientY - rect.top) / rect.height;
    return clampVolumePercent(ratio * 100);
  }, []);

  const endDrag = useCallback(() => {
    if (!dragActiveRef.current) {
      return;
    }
    dragActiveRef.current = false;
    suppressPointerUntilRef.current = performance.now() + POST_DRAG_SUPPRESS_MS;
    onDragChangeRef.current?.(false);
  }, []);

  useEffect(() => {
    if (dragActiveRef.current || dragValue == null) {
      return;
    }
    if (value === dragValue) {
      setDragValue(null);
    }
  }, [dragValue, value]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (performance.now() < suppressPointerUntilRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const track = trackRef.current;
      if (track == null) {
        return;
      }

      const nextValue = valueFromClientY(event.clientY);
      dragActiveRef.current = true;
      onDragChangeRef.current?.(true);
      setDragValue(nextValue);
      onChangeRef.current(nextValue);

      track.setPointerCapture(event.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== event.pointerId) {
          return;
        }
        moveEvent.preventDefault();
        const movedValue = valueFromClientY(moveEvent.clientY);
        setDragValue(movedValue);
        onChangeRef.current(movedValue);
      };

      const handlePointerEnd = (endEvent: PointerEvent): void => {
        if (endEvent.pointerId !== event.pointerId) {
          return;
        }
        endEvent.preventDefault();
        track.removeEventListener('pointermove', handlePointerMove);
        track.removeEventListener('pointerup', handlePointerEnd);
        track.removeEventListener('pointercancel', handlePointerEnd);
        if (track.hasPointerCapture(event.pointerId)) {
          track.releasePointerCapture(event.pointerId);
        }
        endDrag();
      };

      track.addEventListener('pointermove', handlePointerMove, { passive: false });
      track.addEventListener('pointerup', handlePointerEnd);
      track.addEventListener('pointercancel', handlePointerEnd);
    },
    [endDrag, valueFromClientY],
  );

  const fillPercent = clampVolumePercent(dragValue ?? value);

  return (
    <div
      className="card-desc-audio-podcast__volume-popover-panel"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="card-desc-audio-podcast__volume-popover-value" aria-hidden="true">
        {fillPercent}%
      </div>
      <div
        ref={trackRef}
        className="card-desc-audio-podcast__volume-popover-track"
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fillPercent}
        tabIndex={-1}
        onPointerDown={handlePointerDown}
      >
        <div className="card-desc-audio-podcast__volume-popover-rail" aria-hidden="true" />
        <div
          className="card-desc-audio-podcast__volume-popover-fill"
          style={{ height: `${fillPercent}%` }}
          aria-hidden="true"
        />
        <div
          className="card-desc-audio-podcast__volume-popover-thumb"
          style={{ bottom: `calc(${fillPercent}% - var(--audio-volume-thumb-radius, 12px))` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
