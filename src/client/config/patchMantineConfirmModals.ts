import type { ButtonProps } from '@mantine/core';
import { modals } from '@mantine/modals';
import { resolveResponsiveTierByWidth } from '../hooks/useResponsiveTier.js';

/** Confirm / delete Mantine modals: larger touch targets on phone. */
export const MOBILE_CONFIRM_MODAL_BUTTON_SIZE = 'xl' as const satisfies NonNullable<ButtonProps['size']>;

type OpenConfirmModalPayload = Parameters<typeof modals.openConfirmModal>[0];

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return resolveResponsiveTierByWidth(window.innerWidth) === 'mobile';
}

function withMobileConfirmModalButtonSizes(payload: OpenConfirmModalPayload): OpenConfirmModalPayload {
  if (!isMobileViewport()) {
    return payload;
  }
  return {
    ...payload,
    confirmProps: {
      ...payload.confirmProps,
      size: MOBILE_CONFIRM_MODAL_BUTTON_SIZE,
    },
    cancelProps: {
      ...payload.cancelProps,
      size: MOBILE_CONFIRM_MODAL_BUTTON_SIZE,
    },
  };
}

const openConfirmModalOriginal = modals.openConfirmModal.bind(modals);

modals.openConfirmModal = (payload: OpenConfirmModalPayload): string =>
  openConfirmModalOriginal(withMobileConfirmModalButtonSizes(payload));
