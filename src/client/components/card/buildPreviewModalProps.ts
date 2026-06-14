import type { ModalProps } from '@mantine/core';

export type LinkPreviewImageSize = {
  readonly width: number;
  readonly height: number;
} | null;

type PreviewModalProps = Pick<
  ModalProps,
  'fullScreen' | 'withCloseButton' | 'centered' | 'padding' | 'yOffset' | 'xOffset' | 'size' | 'styles'
>;

export function buildPreviewModalProps(
  isVideo: boolean,
  isImage: boolean,
  imageSize: LinkPreviewImageSize,
): PreviewModalProps {
  const layoutProps = isVideo
    ? { padding: 0 as const, yOffset: 0 as const, xOffset: 0 as const }
    : {
        size: isImage
          ? `${imageSize?.width ?? Math.floor(window.innerWidth * 0.96)}px`
          : ('90vw' as const),
      };

  return {
    fullScreen: isVideo,
    withCloseButton: false,
    ...layoutProps,
    centered: !isVideo,
    styles: isVideo
      ? {
          inner: {
            padding: 0,
            alignItems: 'stretch',
            justifyContent: 'stretch',
            minHeight: '100dvh',
            height: '100dvh',
            maxHeight: '100dvh',
          },
          content: {
            padding: 0,
            maxHeight: '100dvh',
            height: '100dvh',
            minHeight: '100dvh',
            maxWidth: '100vw',
            width: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 100%',
            backgroundColor: 'var(--mantine-color-dark-9)',
            transform: 'none',
          },
          body: {
            flex: 1,
            minHeight: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            padding: 0,
            position: 'relative',
            backgroundColor: 'var(--mantine-color-dark-9)',
            overflow: 'hidden',
          },
        }
      : {
          content: {
            maxWidth: '96vw',
            width:
              isImage && imageSize != null
                ? `${imageSize.width}px`
                : isImage
                  ? '96vw'
                  : '90vw',
            minWidth: isImage ? 'unset' : undefined,
            maxHeight: '92vh',
            overflow: 'hidden',
          },
          body: {
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            position: 'relative',
          },
        },
  };
}
