import {
  EMOJI_MART_MOBILE_FULLSCREEN_SHADOW_CSS,
  EMOJI_MART_SHADOW_FIX_CSS,
} from './emojiMartPickerShadowDomCss.js';
import { resolveEmojiMartScrollTargets } from './emojiMartPickerTouchScroll.js';

export { installMobileTouchScrollFallback } from './emojiMartPickerTouchScroll.js';

export function getEmojiMartShadow(rootEl: HTMLElement): ShadowRoot | null {
  const host = rootEl.querySelector('em-emoji-picker');
  return host?.shadowRoot ?? null;
}

function nudgeScrollLayoutOnce(shadow: ShadowRoot): void {
  const scrollEl = shadow.querySelector('.scroll');
  if (!(scrollEl instanceof HTMLElement)) {
    return;
  }
  void scrollEl.offsetHeight;
  const scrollTop = scrollEl.scrollTop;
  scrollEl.scrollTop = scrollTop;
}

function injectShadowStyles(
  shadow: ShadowRoot,
  attr: string,
  css: string,
): boolean {
  if (shadow.querySelector(`style[${attr}]`) != null) {
    return false;
  }
  const style = document.createElement('style');
  style.setAttribute(attr, '1');
  style.textContent = css;
  shadow.appendChild(style);
  return true;
}

export function watchEmojiMartScrollTargets(
  rootEl: HTMLElement,
  onScrollTargetsChange: ((targets: readonly HTMLElement[]) => void) | undefined,
): () => void {
  if (onScrollTargetsChange == null) {
    return () => {};
  }

  let cancelled = false;
  let reportedKey = '';

  const publish = (): void => {
    if (cancelled) {
      return;
    }
    const targets = resolveEmojiMartScrollTargets(rootEl);
    const key = targets.map((target) => target.tagName + target.className).join('|');
    if (key === reportedKey) {
      return;
    }
    reportedKey = key;
    onScrollTargetsChange(targets);
  };

  publish();

  const pollId = window.setInterval(() => {
    publish();
    if (resolveEmojiMartScrollTargets(rootEl).some((t) => t.classList.contains('scroll'))) {
      window.clearInterval(pollId);
    }
  }, 48);

  const domObserver = new MutationObserver(() => {
    publish();
  });
  domObserver.observe(rootEl, { childList: true, subtree: true });

  return () => {
    cancelled = true;
    window.clearInterval(pollId);
    domObserver.disconnect();
    onScrollTargetsChange([]);
    reportedKey = '';
  };
}

export function installEmojiMartPickerShadow(rootEl: HTMLElement, layout: 'popover' | 'fullscreen'): () => void {
  const fixAttr = 'data-card-desc-em-shadow-fix';
  const mobileAttr = 'data-card-desc-em-mobile-fullscreen';
  let cancelled = false;
  let rafChain = 0;
  let pollId: number | undefined;
  let observerTimeoutId: number | undefined;
  let observer: MutationObserver | undefined;

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
    const shadow = getEmojiMartShadow(rootEl);
    if (!shadow?.querySelector('#root')) {
      return false;
    }

    let injected = false;
    if (injectShadowStyles(shadow, fixAttr, EMOJI_MART_SHADOW_FIX_CSS)) {
      injected = true;
    }
    if (layout === 'fullscreen' && injectShadowStyles(shadow, mobileAttr, EMOJI_MART_MOBILE_FULLSCREEN_SHADOW_CSS)) {
      injected = true;
    }
    if (injected) {
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
