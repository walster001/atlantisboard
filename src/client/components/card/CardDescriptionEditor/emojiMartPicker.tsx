import { lazy, useEffect, useRef, type CSSProperties } from 'react';
import { EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH } from '../../../../shared/twemojiPublic.js';
import {
  CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
  CARD_DETAIL_MODAL_BACKGROUND_HEX,
} from '../cardDetailSectionUi.js';

export interface EmojiMartLazyProps {
  readonly onEmojiSelect: (payload: unknown) => void;
  readonly rgbBackground: string;
  readonly rgbColor: string;
  readonly layout?: 'popover' | 'fullscreen';
}

/**
 * emoji-mart shadow DOM: single scroll surface (`.scroll`) for all categories; `#nav` only
 * calls `scrollTo` on click. Wheel stays on `.scroll` (overscroll contain); scrollbar track always shown.
 */
const EMOJI_MART_SHADOW_FIX_CSS = `
#root.flex.flex-column {
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
#nav {
  flex-shrink: 0;
}
.scroll.flex-grow {
  min-height: 0;
  flex: 1 1 0%;
}
/* Inline height:100% on this wrapper breaks scrollHeight until distant rows mount; grow with content. */
.scroll.flex-grow > div {
  height: auto !important;
  min-height: 100%;
  width: 100%;
  box-sizing: border-box;
}
.category + .category {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--em-color-border);
}
.category .sticky {
  margin-bottom: 6px;
}
.scroll {
  overflow-x: hidden !important;
  overflow-y: scroll !important;
  overscroll-behavior: contain;
  touch-action: pan-y;
  scrollbar-gutter: stable;
  /* Wider track than emoji-mart default so the bar reads as always visible. */
  scrollbar-width: auto;
  scrollbar-color: var(--em-color-border) rgb(var(--em-rgb-background));
}
.scroll::-webkit-scrollbar {
  width: 10px;
}
/* emoji-mart only paints the thumb on .scroll:hover — keep track + thumb visible on first paint. */
.scroll::-webkit-scrollbar-track {
  background-color: rgba(0, 0, 0, 0.07);
  border-radius: 8px;
}
.scroll::-webkit-scrollbar-thumb {
  min-height: 48px;
  border: 3px solid rgb(var(--em-rgb-background));
  border-radius: 8px;
  background-color: var(--em-color-border) !important;
}
.scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--em-color-border-over) !important;
}
`;

function installEmojiMartShadowLayoutFix(rootEl: HTMLElement): () => void {
  const attr = 'data-card-desc-em-shadow-fix';
  let cancelled = false;
  let rafChain = 0;
  let pollId: number | undefined;
  let observerTimeoutId: number | undefined;
  let observer: MutationObserver | undefined;

  const nudgeScrollLayoutOnce = (shadow: ShadowRoot): void => {
    const scrollEl = shadow.querySelector('.scroll');
    if (!(scrollEl instanceof HTMLElement)) {
      return;
    }
    void scrollEl.offsetHeight;
    scrollEl.scrollTop = scrollEl.scrollTop;
  };

  const stopWatching = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (pollId !== undefined) {
      window.clearInterval(pollId);
      pollId = undefined;
    }
    if (observerTimeoutId !== undefined) {
      window.clearTimeout(observerTimeoutId);
      observerTimeoutId = undefined;
    }
  };

  const tryInject = (): boolean => {
    if (cancelled) {
      return false;
    }
    const host = rootEl.querySelector('em-emoji-picker');
    const shadow = host?.shadowRoot;
    if (!shadow?.querySelector('#root')) {
      return false;
    }
    if (!shadow.querySelector(`style[${attr}]`)) {
      const style = document.createElement('style');
      style.setAttribute(attr, '1');
      style.textContent = EMOJI_MART_SHADOW_FIX_CSS;
      shadow.appendChild(style);
      nudgeScrollLayoutOnce(shadow);
    }
    return true;
  };

  if (tryInject()) {
    return () => {
      cancelled = true;
    };
  }

  pollId = window.setInterval(() => {
    if (tryInject()) {
      stopWatching();
    }
  }, 48);

  observerTimeoutId = window.setTimeout(() => {
    stopWatching();
  }, 8000);

  observer = new MutationObserver(() => {
    if (tryInject()) {
      stopWatching();
    }
  });
  observer.observe(rootEl, { childList: true, subtree: true });

  const scheduleRafRetries = (): void => {
    const step = (): void => {
      if (cancelled) {
        return;
      }
      if (tryInject()) {
        stopWatching();
        return;
      }
      rafChain += 1;
      if (rafChain < 12) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  };
  scheduleRafRetries();

  return () => {
    cancelled = true;
    stopWatching();
  };
}

export const LazyEmojiMartPicker = lazy(async () => {
  const [{ default: EmojiPicker }, { default: emojiData }] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data/sets/15/twitter.json'),
  ]);

  function EmojiMartPicker({ onEmojiSelect, rgbBackground, rgbColor, layout = 'popover' }: EmojiMartLazyProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = wrapRef.current;
      if (el == null) {
        return;
      }
      const cleanInject = installEmojiMartShadowLayoutFix(el);

      const forwardWheelToEmojiScroll = (e: WheelEvent): void => {
        if (e.ctrlKey) {
          return;
        }
        if (!e.composedPath().includes(el)) {
          return;
        }
        const host = el.querySelector('em-emoji-picker');
        const shadow = host?.shadowRoot;
        const scrollEl = shadow?.querySelector('.scroll');
        if (!(scrollEl instanceof HTMLElement)) {
          return;
        }
        if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
          return;
        }
        const max = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTop = Math.max(0, Math.min(max, scrollEl.scrollTop + e.deltaY));
        e.preventDefault();
        e.stopPropagation();
      };

      el.addEventListener('wheel', forwardWheelToEmojiScroll, { passive: false, capture: true });
      return () => {
        cleanInject();
        el.removeEventListener('wheel', forwardWheelToEmojiScroll, { capture: true });
      };
    }, []);

    return (
      <div
        ref={wrapRef}
        className={
          layout === 'fullscreen'
            ? 'card-desc-emoji-mart-root card-desc-emoji-mart-root--fullscreen'
            : 'card-desc-emoji-mart-root'
        }
        style={
          {
            '--rgb-background': rgbBackground,
            '--rgb-color': rgbColor,
            '--rgb-input': CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
          } as CSSProperties
        }
      >
        <EmojiPicker
          data={emojiData}
          onEmojiSelect={onEmojiSelect}
          theme="light"
          locale="en"
          previewPosition="none"
          skinTonePosition="search"
          searchPosition="sticky"
          navPosition="bottom"
          perLine={9}
          maxFrequentRows={2}
          set="twitter"
          dynamicWidth
          getSpritesheetURL={() => EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH}
        />
      </div>
    );
  }

  return { default: EmojiMartPicker };
});

export function prefetchEmojiMartModules(): void {
  void Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data/sets/15/twitter.json'),
  ]);
}

export const emojiPickerPopoverDropdownStyles = {
  dropdown: {
    maxHeight: 'min(452px, calc(100dvh - 32px))',
    overflow: 'visible',
    backgroundColor: CARD_DETAIL_MODAL_BACKGROUND_HEX,
  },
} as const;
