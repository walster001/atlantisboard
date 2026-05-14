import type { CSSProperties } from 'react';

/** Pass to Mantine `Modal` `classNames.header` — see `iosSafeAreaModal.css`. */
export const KB_IOS_MODAL_HEADER_SAFE_CLASS = 'kb-ios-modal-header-safe';

/** Fullscreen modals: keep footer actions above home indicator. */
export function modalStylesFullscreenSafeBody(): { body: CSSProperties } {
  return {
    body: {
      paddingBottom: 'max(var(--mantine-spacing-md), env(safe-area-inset-bottom, 0px))',
    },
  };
}

/** Modals without a Mantine header (e.g. loading shell): inset inner wrapper from top. */
export function modalStylesInnerSafeTop(): { inner: CSSProperties } {
  return {
    inner: {
      paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))',
    },
  };
}
