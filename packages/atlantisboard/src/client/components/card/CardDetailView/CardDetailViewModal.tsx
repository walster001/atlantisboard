import { Suspense, useMemo, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Divider,
  FocusTrap,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlignLeft, IconLink, IconPencil, IconTrash } from '@tabler/icons-react';
import { CARD_TITLE_MAX_LENGTH } from '../../../constants/cardFieldLimits.js';
import { TwemojiPlainText } from '../../common/TwemojiPlainText.js';
import { CardDescriptionReadonly } from '../CardDescriptionReadonly.js';
import { DuplicateCardModal } from '../DuplicateCardModal.js';
import { CardDescriptionEditor, CardDetailViewScrollSections } from './helpers.js';
import {
  CARD_DETAIL_MODAL_BACKGROUND_HEX,
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailEmptyStateProps,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from '../cardDetailSectionUi.js';
import { KB_IOS_MODAL_HEADER_SAFE_CLASS } from '../../../constants/iosModalSafeArea.js';
import { type CardDetailViewController } from './useCardDetailViewController.js';
import { useMobileSwipeDownToClose } from './useMobileSwipeDownToClose.js';
import {
  EmojiPickerScrollShardContext,
  type EmojiPickerScrollShardContextValue,
} from '../CardDescriptionEditor/emojiPickerScrollShardContext.js';

interface CardDetailViewModalProps {
  readonly controller: CardDetailViewController;
  readonly boardId: string;
  readonly listId: string;
  readonly onClose: () => void;
  readonly onCardDuplicated?: (appliedToCurrentBoard: boolean) => void;
}

export function CardDetailViewModal({
  controller,
  boardId,
  listId,
  onClose,
  onCardDuplicated,
}: CardDetailViewModalProps) {
  const { touchHandlers } = useMobileSwipeDownToClose(
    onClose,
    controller.isMobile && !controller.isEditing,
  );

  const [emojiScrollShards, setEmojiScrollShards] = useState<readonly HTMLElement[]>([]);

  const emojiScrollShardContextValue = useMemo<EmojiPickerScrollShardContextValue>(
    () => ({ setScrollShards: setEmojiScrollShards }),
    [],
  );

  const cardDetailRemoveScrollProps = useMemo(() => {
    if (emojiScrollShards.length === 0) {
      return undefined;
    }
    return { shards: [...emojiScrollShards] };
  }, [emojiScrollShards]);

  return (
    <>
      <EmojiPickerScrollShardContext.Provider value={emojiScrollShardContextValue}>
      <Modal
        opened
        onClose={onClose}
        size="54vw"
        fullScreen={controller.isMobile}
        className="card-detail-modal"
        classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
        withinPortal={false}
        transitionProps={{ duration: 0 }}
        overlayProps={{ backgroundOpacity: 0.55, blur: 0 }}
        {...(cardDetailRemoveScrollProps != null
          ? { removeScrollProps: cardDetailRemoveScrollProps }
          : {})}
        title={
          <Box
            style={{
              width: '100%',
              minWidth: 0,
              ...(controller.isMobile
                ? {
                    /* Safe top inset is on the Modal header (`KB_IOS_MODAL_HEADER_SAFE_CLASS`). */
                    paddingBottom: 12,
                    touchAction: 'pan-y',
                  }
                : {}),
            }}
            {...(controller.isMobile && !controller.isEditing ? touchHandlers : {})}
          >
          <Group justify="space-between" align="center" wrap="nowrap" gap="md" style={{ width: '100%', minWidth: 0 }}>
            <Box style={{ flex: 1, minWidth: 0 }}>
              {controller.isEditing ? (
                <TextInput
                  size="md"
                  fw={700}
                  variant="unstyled"
                  value={controller.title}
                  maxLength={CARD_TITLE_MAX_LENGTH}
                  onChange={(event) => controller.setTitle(event.currentTarget.value)}
                  onBlur={() => void controller.handleUpdateTitle()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void controller.handleUpdateTitle();
                    }
                    if (event.key === 'Escape') {
                      controller.setTitle(controller.card.title);
                      controller.setIsEditing(false);
                    }
                  }}
                  autoFocus
                  disabled={controller.loading}
                  styles={{ input: { color: 'var(--board-card-detail-title-text, #1a1b1e)' } }}
                />
              ) : (
                <Text
                  style={{
                    cursor: controller.canEditCard ? 'pointer' : 'default',
                    lineHeight: 1.25,
                    fontFamily: 'var(--kb-app-ui-font-family)',
                    fontWeight: 600,
                    fontSize: '1.6rem',
                    color: 'var(--board-card-detail-title-text, #1a1b1e)',
                  }}
                  onClick={() => {
                    if (controller.canEditCard) {
                      controller.setIsEditing(true);
                    }
                  }}
                >
                  <TwemojiPlainText text={controller.card.title} />
                </Text>
              )}
            </Box>
            <Group gap={controller.isMobile ? 'xs' : 4} wrap="nowrap" align="center">
              <ActionIcon
                variant="subtle"
                color="gray"
                size={controller.isMobile ? 'xl' : 'lg'}
                radius="md"
                aria-label="Copy link to this card"
                title="Copy link to this card"
                onClick={() => void controller.handleCopyCardLink()}
                styles={{ root: { color: 'var(--board-card-detail-text, #868e96)' } }}
              >
                <span style={{ display: 'inline-flex', lineHeight: 0, transform: 'rotate(45deg)' }} aria-hidden>
                  <IconLink size={controller.isMobile ? 22 : 19} stroke={1.5} />
                </span>
              </ActionIcon>
              <Modal.CloseButton
                aria-label="Close"
                size={controller.isMobile ? 'xl' : 'md'}
                style={{ color: 'var(--board-card-detail-text, #868e96)' }}
              />
            </Group>
          </Group>
          </Box>
        }
        centered
        withCloseButton={false}
        styles={controller.modalStyles}
      >
        <>
          <FocusTrap.InitialFocus />
          <Stack gap={0} style={{ minHeight: 0, flex: 1 }}>
            <Divider color="gray.3" />
            <ScrollArea type="auto" offsetScrollbars style={{ flex: '1 1 0%', minHeight: 0, maxHeight: '100%' }}>
              <Box px="md" py="md">
                <Stack gap="lg" pr="xs">
                  <Box>
                    <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap">
                        <IconAlignLeft size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
                        <Text {...cardDetailSectionTitleProps}>Description</Text>
                      </Group>
                      {controller.canEditCard && !controller.isEditingDescription ? (
                        <Button
                          size="sm"
                          variant="default"
                          leftSection={<IconPencil size={14} />}
                          styles={cardDetailSoftButtonStyles}
                          onClick={() => controller.setIsEditingDescription(true)}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </Group>
                    {controller.isEditingDescription ? (
                      <Box
                        style={{
                          border: '1px solid var(--mantine-color-gray-3)',
                          borderRadius: 'var(--mantine-radius-md)',
                          /* `overflow: hidden` breaks `position: sticky` for the Tiptap toolbar inside the modal ScrollArea on mobile. */
                          overflow: controller.isMobile ? 'visible' : 'hidden',
                        }}
                      >
                        <Suspense
                          fallback={
                            <Center style={{ minHeight: 280 }}>
                              <Loader size="sm" type="dots" />
                            </Center>
                          }
                        >
                          <CardDescriptionEditor
                            key={`${controller.card.id}-desc-edit`}
                            cardId={controller.card.id}
                            valueJson={controller.card.description}
                            placeholder="Add a description…"
                            minHeightPx={280}
                            onEditorReady={controller.onDescriptionEditorReady}
                            pendingDescriptionMediaRef={controller.pendingDescriptionMediaRef}
                          />
                        </Suspense>
                        <Group justify="flex-start" gap="xs" p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-1)' }}>
                          <Button
                            size="sm"
                            color="blue"
                            onClick={() => void controller.handleUpdateDescription()}
                            disabled={controller.loading}
                            loading={controller.loading}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="subtle"
                            onClick={controller.handleCancelDescriptionEdit}
                            disabled={controller.loading}
                          >
                            Cancel
                          </Button>
                        </Group>
                      </Box>
                    ) : (
                      <Box
                        p={0}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 0,
                          minHeight: 'unset',
                          cursor: controller.canEditCard ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (controller.canEditCard) {
                            controller.setIsEditingDescription(true);
                          }
                        }}
                      >
                        {controller.isDescriptionEmpty ? (
                          <Text {...cardDetailEmptyStateProps}>Click to add a description…</Text>
                        ) : (
                          <CardDescriptionReadonly
                            valueJson={controller.card.description}
                            valueHtml={controller.card.descriptionHtml}
                          />
                        )}
                      </Box>
                    )}
                  </Box>

                  <Suspense
                    fallback={
                      <Stack gap="lg" pr="xs" aria-busy="true">
                        <Skeleton height={56} radius="md" />
                        <Skeleton height={120} radius="md" />
                        <Skeleton height={88} radius="md" />
                        <Skeleton height={160} radius="md" />
                      </Stack>
                    }
                  >
                    <CardDetailViewScrollSections
                      card={controller.card}
                      boardId={boardId}
                      loading={controller.loading}
                      showStartDateOnCards={controller.showStartDateOnCards}
                      showDueDateOnCards={controller.showDueDateOnCards}
                      showEndDateOnCards={controller.showEndDateOnCards}
                      showRemindersSection={controller.showRemindersSection}
                      showLabels={controller.showLabels}
                      showAssignees={controller.showAssignees}
                      showChecklist={controller.showChecklist}
                      showAttachments={controller.showAttachments}
                      showComments={controller.showComments}
                      canCreateComments={controller.canCreateComments}
                      canDeleteOthersComments={controller.canDeleteOthersComments}
                      canEditCard={controller.canEditCard}
                      canEditStartDate={controller.canEditStartDate}
                      canEditDueDate={controller.canEditDueDate}
                      canEditEndDate={controller.canEditEndDate}
                      startLocal={controller.start.value}
                      setStartLocal={controller.start.setValue}
                      startPickerOpened={controller.start.opened}
                      setStartPickerOpened={controller.start.setOpened}
                      onSaveStartDate={controller.handleSaveStartDate}
                      onClearStartDate={controller.handleClearStartDate}
                      dueLocal={controller.due.value}
                      setDueLocal={controller.due.setValue}
                      duePickerOpened={controller.due.opened}
                      setDuePickerOpened={controller.due.setOpened}
                      syncCardToBoardAndDexie={controller.syncCardToBoardAndDexie}
                      onBeforeDeleteAttachment={controller.onBeforeDeleteAttachment}
                      onSaveDueDate={controller.handleSaveDueDate}
                      onClearDueDate={controller.handleClearDueDate}
                      endLocal={controller.end.value}
                      setEndLocal={controller.end.setValue}
                      endPickerOpened={controller.end.opened}
                      setEndPickerOpened={controller.end.setOpened}
                      onSaveEndDate={controller.handleSaveEndDate}
                      onClearEndDate={controller.handleClearEndDate}
                    />
                  </Suspense>
                </Stack>
              </Box>
            </ScrollArea>

            {controller.canDeleteCard || controller.canDuplicateCard ? (
              <Group
                justify="space-between"
                align="center"
                gap="sm"
                wrap="wrap"
                px="md"
                py="sm"
                style={{
                  flexShrink: 0,
                  backgroundColor: CARD_DETAIL_MODAL_BACKGROUND_HEX,
                  borderTop: '1px solid var(--mantine-color-gray-3)',
                  ...(controller.isMobile
                    ? {
                        paddingBottom: 'max(var(--mantine-spacing-sm), env(safe-area-inset-bottom, 0px))',
                      }
                    : {}),
                }}
              >
                {controller.canDeleteCard ? (
                  <Button
                    color="red"
                    variant="filled"
                    size={controller.isMobile ? 'md' : 'sm'}
                    leftSection={<IconTrash size={controller.isMobile ? 18 : 16} />}
                    onClick={controller.handleDeleteCard}
                    disabled={controller.loading}
                  >
                    Delete Card
                  </Button>
                ) : null}
                {controller.canDuplicateCard ? (
                  <Button
                    size={controller.isMobile ? 'md' : 'sm'}
                    variant="default"
                    styles={cardDetailSoftButtonStyles}
                    onClick={() => controller.setShowDuplicateModal(true)}
                  >
                    Duplicate Card
                  </Button>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        </>
      </Modal>

      {controller.showDuplicateModal ? (
        <DuplicateCardModal
          cardId={controller.card.id}
          currentListId={listId}
          boardId={boardId}
          boardName={controller.boardName}
          workspaceId={controller.boardWorkspaceId ?? undefined}
          onClose={() => controller.setShowDuplicateModal(false)}
          onSuccess={(appliedToCurrentBoard) => onCardDuplicated?.(appliedToCurrentBoard)}
        />
      ) : null}
      </EmojiPickerScrollShardContext.Provider>
    </>
  );
}
