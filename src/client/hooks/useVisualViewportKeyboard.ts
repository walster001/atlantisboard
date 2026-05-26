import { useCallback, useEffect, useState } from 'react';

export interface KeyboardDockPosition {
  readonly isKeyboardOpen: boolean;
  /**
   * CSS `bottom` value (px) to place a fixed element at the bottom of the
   * visual viewport — i.e. directly above the virtual keyboard.
   */
  readonly bottom: number;
}

/**
 * Minimum pixel gap between `window.innerHeight` and `visualViewport.height`
 * before we consider the virtual keyboard open.  150 px is well above any
 * browser-chrome resize but comfortably below the smallest mobile keyboards.
 */
const KEYBOARD_GAP_THRESHOLD_PX = 150;

/**
 * iOS shows a "Done / ◀ ▶" input accessory bar above the keyboard that is not
 * always reflected in `visualViewport.height`. Add this offset on iOS to avoid
 * the toolbar sitting behind the accessory bar.
 */
const IOS_INPUT_ACCESSORY_BAR_PX = 44;

const IS_IOS =
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !((navigator as unknown) as Record<string, unknown>).MSStream;

/**
 * Tracks the mobile virtual keyboard via the `window.visualViewport` API and
 * returns positioning data to dock a toolbar above it.
 *
 * On iOS Safari `window.innerHeight` stays constant while
 * `visualViewport.height` shrinks — the gap tells us the keyboard is open.
 * On Android Chrome (default `resizes-visual` mode) the same applies.
 * On Android with `resizes-content` both values shrink equally so the gap
 * stays ≈ 0 and `position: fixed; bottom: 0` already works — no correction
 * needed.
 */
export function useVisualViewportKeyboard(enabled: boolean): KeyboardDockPosition {
  const [position, setPosition] = useState<KeyboardDockPosition>({
    isKeyboardOpen: false,
    bottom: 0,
  });

  const update = useCallback(() => {
    const vv = globalThis.window?.visualViewport;
    if (vv == null) {
      return;
    }

    const gap = window.innerHeight - vv.height;
    const isKeyboardOpen = gap > KEYBOARD_GAP_THRESHOLD_PX;
    const iosOffset = IS_IOS && isKeyboardOpen ? IOS_INPUT_ACCESSORY_BAR_PX : 0;
    const bottom = isKeyboardOpen
      ? Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)) + iosOffset
      : 0;

    setPosition((prev) => {
      if (prev.isKeyboardOpen === isKeyboardOpen && prev.bottom === bottom) {
        return prev;
      }
      return { isKeyboardOpen, bottom };
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPosition({ isKeyboardOpen: false, bottom: 0 });
      return;
    }

    const vv = globalThis.window?.visualViewport;
    if (vv == null) {
      return;
    }

    update();

    vv.addEventListener('resize', update, { passive: true });
    vv.addEventListener('scroll', update, { passive: true });

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled, update]);

  return position;
}
