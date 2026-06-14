import {
  useCallback,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface CardDescriptionPodcastVerticalVolumeSliderProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly onDragChange?: (dragging: boolean) => void;
}

type DocumentDragListeners = {
  readonly pointerMove: (event: PointerEvent) => void;
  readonly pointerEnd: () => void;
  readonly touchMove: (event: TouchEvent) => void;
  readonly touchEnd: () => void;
};

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
  const listenersRef = useRef<DocumentDragListeners | null>(null);

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

  const endDocumentDrag = useCallback(() => {
    if (!dragActiveRef.current) {
      return;
    }
    dragActiveRef.current = false;
    onDragChangeRef.current?.(false);
    const listeners = listenersRef.current;
    if (listeners == null) {
      return;
    }
    document.removeEventListener('pointermove', listeners.pointerMove);
    document.removeEventListener('pointerup', listeners.pointerEnd);
    document.removeEventListener('pointercancel', listeners.pointerEnd);
    document.removeEventListener('touchmove', listeners.touchMove);
    document.removeEventListener('touchend', listeners.touchEnd);
    document.removeEventListener('touchcancel', listeners.touchEnd);
    listenersRef.current = null;
  }, []);

  const startDocumentDrag = useCallback(
    (clientY: number) => {
      onChangeRef.current(valueFromClientY(clientY));
      if (dragActiveRef.current) {
        return;
      }
      dragActiveRef.current = true;
      onDragChangeRef.current?.(true);

      const pointerMove = (event: PointerEvent): void => {
        event.preventDefault();
        onChangeRef.current(valueFromClientY(event.clientY));
      };
      const pointerEnd = (): void => {
        endDocumentDrag();
      };
      const touchMove = (event: TouchEvent): void => {
        if (event.cancelable) {
          event.preventDefault();
        }
        const touch = event.touches[0];
        if (touch == null) {
          return;
        }
        onChangeRef.current(valueFromClientY(touch.clientY));
      };
      const touchEnd = (): void => {
        endDocumentDrag();
      };

      listenersRef.current = {
        pointerMove,
        pointerEnd,
        touchMove,
        touchEnd,
      };

      document.addEventListener('pointermove', pointerMove, { passive: false });
      document.addEventListener('pointerup', pointerEnd);
      document.addEventListener('pointercancel', pointerEnd);
      document.addEventListener('touchmove', touchMove, { passive: false });
      document.addEventListener('touchend', touchEnd);
      document.addEventListener('touchcancel', touchEnd);
    },
    [endDocumentDrag, valueFromClientY],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (event.pointerType === 'touch') {
        return;
      }
      event.preventDefault();
      startDocumentDrag(event.clientY);
    },
    [startDocumentDrag],
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track == null) {
      return undefined;
    }

    const onNativeTouchStart = (event: TouchEvent): void => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      const touch = event.touches[0];
      if (touch == null) {
        return;
      }
      startDocumentDrag(touch.clientY);
    };

    track.addEventListener('touchstart', onNativeTouchStart, { passive: false });
    return () => {
      track.removeEventListener('touchstart', onNativeTouchStart);
    };
  }, [startDocumentDrag]);

  useLayoutEffect(() => {
    return () => {
      endDocumentDrag();
    };
  }, [endDocumentDrag]);

  const fillPercent = clampVolumePercent(value);

  return (
    <div
      className="card-desc-audio-podcast__volume-popover-panel"
      onClick={(event) => {
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
