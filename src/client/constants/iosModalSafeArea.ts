import type { CSSProperties } from 'react';

/** Pass to Mantine `Modal` `classNames.header` — see `iosSafeAreaModal.css`. */
export const KB_IOS_MODAL_HEADER_SAFE_CLASS = 'kb-ios-modal-header-safe';

/** Pass to Mantine `Modal` `classNames.inner` when `title={null}` — see `iosSafeAreaModal.css`. */
export const KB_IOS_MODAL_INNER_SAFE_CLASS = 'kb-ios-modal-inner-safe';

/** Fullscreen modals: keep footer actions above home indicator. */
export function modalStylesFullscreenSafeBody(
  fullscreen: boolean,
): Partial<Record<'body', CSSProperties>> {
  if (!fullscreen) {
    return {};
  }
  return {
    body: {
      paddingBottom: 'max(var(--mantine-spacing-md), env(safe-area-inset-bottom, 0px))',
    },
  };
}
