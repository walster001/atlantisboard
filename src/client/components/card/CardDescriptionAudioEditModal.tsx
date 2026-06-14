import { useLayoutEffect, useState, type ReactElement } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconTrash, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import { prewarmMalwareScannerOnUploadIntent } from '../../utils/prewarmMalwareScanner.js';
import { requireUploadedAttachmentId } from '../../utils/api/attachmentApiMethods.js';
import { CardDescriptionTextBackgroundColorPickers } from './CardDescriptionTextBackgroundColorPickers.js';
import { CardDescriptionPodcastPreviewTimeline } from './CardDescriptionPodcastPreviewTimeline.js';
import { CardDescriptionPodcastPreviewControls } from './CardDescriptionPodcastPreviewControls.js';
import { CardDescriptionPodcastPreviewTimeDisplay } from './CardDescriptionPodcastPreviewTimeDisplay.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import {
  KB_IOS_MODAL_HEADER_SAFE_CLASS,
  modalStylesFullscreenSafeBody,
} from '../../constants/iosModalSafeArea.js';
import './cardDescriptionAudioEditModal.css';
import {
  AUDIO_DISPLAY_DESCRIPTION_MAX_LENGTH,
  AUDIO_DISPLAY_TITLE_MAX_LENGTH,
  AUDIO_SKELETON_EXAMPLE_TIME,
  DEFAULT_AUDIO_BG_COLOR,
  DEFAULT_AUDIO_BUTTON_HOVER_COLOR,
  DEFAULT_AUDIO_DISPLAY_DESCRIPTION,
  DEFAULT_AUDIO_DISPLAY_TITLE,
  DEFAULT_AUDIO_TEXT_COLOR,
  audioPodcastAppearanceStyle,
  readAudioDisplayAttrs,
} from './tiptapAudioDisplay.js';

type AudioDisplayDraft = {
  readonly displayTitle: string;
  readonly displayDescription: string;
  readonly coverSrc: string | null;
  readonly textColor: string;
  readonly bgColor: string;
  readonly buttonHoverColor: string;
};

function readAudioDisplayDraft(editor: Editor, nodePos: number): AudioDisplayDraft | null {
  const node = editor.state.doc.nodeAt(nodePos);
  if (node == null || node.type.name !== 'audio') {
    return null;
  }
  return readAudioDisplayAttrs(node.attrs as Record<string, unknown>);
}

export interface CardDescriptionAudioEditModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly editor: Editor;
  readonly nodePos: number | null;
  readonly cardId: string;
}

export function CardDescriptionAudioEditModal({
  opened,
  onClose,
  editor,
  nodePos,
  cardId,
}: CardDescriptionAudioEditModalProps): ReactElement {
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const draft = nodePos != null ? readAudioDisplayDraft(editor, nodePos) : null;

  const [displayTitle, setDisplayTitle] = useState(
    () => draft?.displayTitle ?? DEFAULT_AUDIO_DISPLAY_TITLE,
  );
  const [displayDescription, setDisplayDescription] = useState(
    () => draft?.displayDescription ?? DEFAULT_AUDIO_DISPLAY_DESCRIPTION,
  );
  const [coverSrc, setCoverSrc] = useState<string | null>(() => draft?.coverSrc ?? null);
  const [textColor, setTextColor] = useState(
    () => draft?.textColor ?? DEFAULT_AUDIO_TEXT_COLOR,
  );
  const [bgColor, setBgColor] = useState(() => draft?.bgColor ?? DEFAULT_AUDIO_BG_COLOR);
  const [buttonHoverColor, setButtonHoverColor] = useState(
    () => draft?.buttonHoverColor ?? DEFAULT_AUDIO_BUTTON_HOVER_COLOR,
  );
  const [coverUploadBusy, setCoverUploadBusy] = useState(false);

  useLayoutEffect(() => {
    if (!opened || nodePos == null) {
      return;
    }
    const next = readAudioDisplayDraft(editor, nodePos);
    if (next == null) {
      onClose();
      return;
    }
    setDisplayTitle(next.displayTitle);
    setDisplayDescription(next.displayDescription);
    setCoverSrc(next.coverSrc);
    setTextColor(next.textColor);
    setBgColor(next.bgColor);
    setButtonHoverColor(next.buttonHoverColor);
  }, [editor, nodePos, onClose, opened]);

  const uploadCover = (): void => {
    prewarmMalwareScannerOnUploadIntent();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file == null) {
        return;
      }
      setCoverUploadBusy(true);
      try {
        const response = await api.uploadCardAttachment(cardId, file);
        const attachmentId = requireUploadedAttachmentId(response);
        setCoverSrc(api.getAttachmentFileUrl(attachmentId));
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Upload failed',
          message: error instanceof Error ? error.message : 'Could not upload cover image.',
        });
      }
      setCoverUploadBusy(false);
    };
    input.click();
  };

  const handleSave = (): void => {
    if (nodePos == null) {
      return;
    }
    const title = displayTitle.trim();
    const description = displayDescription.trim();
    if (title.length > AUDIO_DISPLAY_TITLE_MAX_LENGTH) {
      notifications.show({
        color: 'red',
        title: 'Title too long',
        message: `Title cannot exceed ${AUDIO_DISPLAY_TITLE_MAX_LENGTH} characters.`,
      });
      return;
    }
    if (description.length > AUDIO_DISPLAY_DESCRIPTION_MAX_LENGTH) {
      notifications.show({
        color: 'red',
        title: 'Description too long',
        message: `Description cannot exceed ${AUDIO_DISPLAY_DESCRIPTION_MAX_LENGTH} characters.`,
      });
      return;
    }

    const { state } = editor;
    const node = state.doc.nodeAt(nodePos);
    if (node == null || node.type.name !== 'audio') {
      onClose();
      return;
    }

    const next = {
      ...node.attrs,
      displayTitle: title,
      displayDescription: description,
      coverSrc: coverSrc != null && coverSrc.trim() !== '' ? coverSrc.trim() : null,
      textColor,
      bgColor,
      buttonHoverColor,
    };
    editor.view.dispatch(state.tr.setNodeMarkup(nodePos, undefined, next));
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Audio player appearance"
      size={isMobile ? '100%' : 'md'}
      fullScreen={isMobile}
      centered={!isMobile}
      zIndex={600}
      overlayProps={{ backgroundOpacity: 0, blur: 0 }}
      classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
      styles={modalStylesFullscreenSafeBody(isMobile)}
    >
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb={6}>
            Preview
          </Text>
          <Box className="card-desc-audio-edit-modal__preview" p="md" style={{
              borderRadius: 8,
              border: '1px solid var(--mantine-color-gray-3)',
              backgroundColor: 'var(--mantine-color-gray-0)',
            }}>
            <div
              className="card-desc-audio-player card-desc-audio-podcast card-desc-audio-podcast--skeleton card-desc-audio-podcast--modal-preview"
              style={audioPodcastAppearanceStyle(textColor, bgColor, buttonHoverColor)}
            >
              <div className="card-desc-audio-podcast__layout">
                <div className="card-desc-audio-podcast__body">
                  <div
                    className={[
                      'card-desc-audio-podcast__meta',
                      displayTitle.trim() === '' && displayDescription.trim() === ''
                        ? 'card-desc-audio-podcast__meta--time-only'
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="card-desc-audio-podcast__meta-text">
                      <Text component="div" className="card-desc-audio-podcast__title">
                        {displayTitle.trim() !== '' ? displayTitle.trim() : 'Track title'}
                      </Text>
                      {displayDescription.trim() !== '' ? (
                        <Text component="div" className="card-desc-audio-podcast__description">
                          {displayDescription.trim()}
                        </Text>
                      ) : null}
                    </div>
                    <CardDescriptionPodcastPreviewTimeDisplay timeLabel={AUDIO_SKELETON_EXAMPLE_TIME} />
                  </div>
                  <CardDescriptionPodcastPreviewTimeline />
                  <CardDescriptionPodcastPreviewControls />
                </div>
              </div>
            </div>
          </Box>
        </div>
        <TextInput
          label="Title"
          placeholder="Episode or track title"
          value={displayTitle}
          maxLength={AUDIO_DISPLAY_TITLE_MAX_LENGTH}
          onChange={(event) => setDisplayTitle(event.currentTarget.value)}
        />
        <Textarea
          label="Description"
          placeholder="Short subtitle or summary"
          value={displayDescription}
          maxLength={AUDIO_DISPLAY_DESCRIPTION_MAX_LENGTH}
          minRows={2}
          autosize
          onChange={(event) => setDisplayDescription(event.currentTarget.value)}
        />
        <div>
          <Text size="sm" fw={500} mb={6}>
            Cover image (optional)
          </Text>
          <Group gap="sm" align="flex-start">
            <Box
              style={{
                width: 72,
                height: 72,
                borderRadius: 8,
                border: '1px solid var(--mantine-color-gray-4)',
                backgroundColor: 'var(--mantine-color-gray-1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {coverSrc != null && coverSrc.trim() !== '' ? (
                <img
                  src={api.resolveAttachmentUrl(coverSrc)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Text size="xs" c="dimmed">
                  No image
                </Text>
              )}
            </Box>
            <Stack gap="xs">
              <Button
                variant="light"
                leftSection={<IconUpload size={16} />}
                loading={coverUploadBusy}
                onClick={uploadCover}
              >
                Upload image
              </Button>
              {coverSrc != null ? (
                <Button
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => setCoverSrc(null)}
                >
                  Remove image
                </Button>
              ) : null}
            </Stack>
          </Group>
        </div>
        <CardDescriptionTextBackgroundColorPickers
          textColor={textColor}
          bgColor={bgColor}
          onTextColorChange={setTextColor}
          onBgColorChange={setBgColor}
          hoverColor={buttonHoverColor}
          onHoverColorChange={setButtonHoverColor}
          hoverColorLabel="Hover colour"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
