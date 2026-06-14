import { lazy, useEffect, useRef, type CSSProperties } from 'react';
import { EMOJI_SPRITESHEET_PUBLIC_PATH } from '../../../../shared/twemojiPublic.js';
import { withExtendedEmojiSheet } from '../../../../shared/twemoji/emojiMartTwitterData.js';
import {
  CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
  CARD_DETAIL_MODAL_BACKGROUND_HEX,
} from '../cardDetailSectionUi.js';
import {
  getEmojiMartShadow,
  installEmojiMartPickerShadow,
  installMobileTouchScrollFallback,
  watchEmojiMartScrollTargets,
} from './emojiMartPickerShadowDom.js';

export interface EmojiMartLazyProps {
  readonly onEmojiSelect: (payload: unknown) => void;
  readonly rgbBackground: string;
  readonly rgbColor: string;
  readonly layout?: 'popover' | 'fullscreen';
  /** Scroll surfaces for react-remove-scroll `shards` (portaled fullscreen + card detail modal). */
  readonly onScrollTargetsChange?: (targets: readonly HTMLElement[]) => void;
}

export const LazyEmojiMartPicker = lazy(async () => {
  const [{ default: EmojiPicker }, { default: emojiData }] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data/sets/15/twitter.json'),
  ]);
  const twitterSetData = withExtendedEmojiSheet(emojiData);

  function EmojiMartPicker({
    onEmojiSelect,
    rgbBackground,
    rgbColor,
    layout = 'popover',
    onScrollTargetsChange,
  }: EmojiMartLazyProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = wrapRef.current;
      if (el == null) {
        return;
      }
      const cleanShadow = installEmojiMartPickerShadow(el, layout);
      const cleanScrollTargets =
        layout === 'fullscreen' ? watchEmojiMartScrollTargets(el, onScrollTargetsChange) : () => undefined;
      const useTouchScrollFallback =
        layout === 'fullscreen' && window.matchMedia('(pointer: coarse)').matches;
      const cleanTouchFallback = useTouchScrollFallback
        ? installMobileTouchScrollFallback(el)
        : () => undefined;

      const forwardWheelToEmojiScroll = (e: WheelEvent): void => {
        if (e.ctrlKey) {
          return;
        }
        if (!e.composedPath().includes(el)) {
          return;
        }
        const scrollEl = getEmojiMartShadow(el)?.querySelector('.scroll');
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
        cleanShadow();
        cleanScrollTargets();
        cleanTouchFallback();
        el.removeEventListener('wheel', forwardWheelToEmojiScroll, { capture: true });
      };
    }, [layout, onScrollTargetsChange]);

    return (
      <div
        ref={wrapRef}
        className={
          layout === 'fullscreen'
            ? 'card-desc-emoji-mart-root card-desc-emoji-mart-root--fullscreen'
            : 'card-desc-emoji-mart-root'
        }
        data-emoji-layout={layout}
        style={
          {
            '--rgb-background': rgbBackground,
            '--rgb-color': rgbColor,
            '--rgb-input': CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
          } as CSSProperties
        }
      >
        <EmojiPicker
          data={twitterSetData}
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
          getSpritesheetURL={() => EMOJI_SPRITESHEET_PUBLIC_PATH}
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
