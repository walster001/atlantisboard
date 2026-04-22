import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Modal,
  TextInput,
  Button,
  Divider,
  Stack,
  Group,
  Text,
  Box,
  ScrollArea,
  Loader,
  Center,
  Skeleton,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAlignLeft, IconPencil, IconTrash } from '@tabler/icons-react';
import {
  cardCoverReferencesAttachment,
  collectReferencedAttachmentIdsFromDescriptionJson,
  stripAttachmentFromDescriptionJsonString,
} from '../../../shared/cardDescriptionAttachmentRefs.js';
import { CARD_TITLE_MAX_LENGTH } from '../../constants/cardFieldLimits.js';
import { db, type BoardDB, type CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import { serializeCardDescriptionEditor } from './cardDescriptionEditorSerialize.js';

const CardDescriptionEditor = lazy(async () => {
  const m = await import('./CardDescriptionEditor.js');
  return { default: m.CardDescriptionEditor };
});

const CardDetailViewScrollSections = lazy(async () => {
  const m = await import('./CardDetailViewScrollSections.js');
  return { default: m.CardDetailViewScrollSections };
});
import { TwemojiPlainText } from '../common/TwemojiPlainText.js';
import { CardDescriptionReadonly } from './CardDescriptionReadonly.js';
import {
  isCardDescriptionEmpty,
  parseCardDescriptionJson,
} from './cardDescriptionTiptap.js';
import { DuplicateCardModal } from './DuplicateCardModal.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailEmptyStateProps,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';
import { useBoardPermissions } from '../../hooks/useBoardPermissions.js';
function toDatetimeLocalValue(d: Date): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

function cardUpdatedAtMs(c: CardDB): number {
  try {
    return new Date(c.updatedAt).getTime();
  } catch {
    return 0;
  }
}

function shouldAcceptIncomingCard(current: CardDB, incoming: CardDB): boolean {
  const incomingTs = cardUpdatedAtMs(incoming);
  const currentTs = cardUpdatedAtMs(current);
  if (incomingTs > currentTs) {
    const currentHasDescription = (current.description ?? '').trim() !== '';
    if (currentHasDescription && incoming.description === undefined) {
      return false;
    }
    return true;
  }

  // Same timestamp: only accept if incoming is strictly richer detail than current.
  const detailScore = (card: CardDB): number => {
    let score = 0;
    if ((card.description ?? '').trim() !== '') score += 1;
    if (card.attachments.length > 0) score += 1;
    if (card.comments.length > 0) score += 1;
    if (card.checklists.length > 0) score += 1;
    if (card.reminders.length > 0) score += 1;
    return score;
  };

  return detailScore(incoming) > detailScore(current);
}

interface CardDetailViewProps {
  card: CardDB;
  boardId: string;
  boardWorkspaceId?: string | null;
  boardSettings?: BoardDB['settings'];
  listId: string;
  onClose: () => void;
  onCardDuplicated?: () => void;
  /** Called after the card is removed from the API and local DB (e.g. refresh Kanban). */
  onCardDeleted?: () => void;
  /** Merges successful edits into Kanban list state (and Dexie) so tiles stay current. */
  onCardUpdated?: (card: CardDB) => void;
}

export function CardDetailView({
  card: initialCard,
  boardId,
  boardWorkspaceId,
  boardSettings,
  listId,
  onClose,
  onCardDuplicated,
  onCardDeleted,
  onCardUpdated,
}: CardDetailViewProps) {
  const [card, setCard] = useState<CardDB>(initialCard);
  const [title, setTitle] = useState(card.title);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [loading, setLoading] = useState(false);
  const descriptionEditorRef = useRef<Editor | null>(null);
  const cardRef = useRef(card);
  cardRef.current = card;
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duePickerOpened, setDuePickerOpened] = useState(false);
  const dueTimeKey = card.dueDate != null ? new Date(card.dueDate).getTime() : 0;
  const dueLocalFromCard = useMemo(
    () => (card.dueDate != null ? toDatetimeLocalValue(new Date(card.dueDate)) : ''),
    [dueTimeKey],
  );
  const [dueLocalOverride, setDueLocalOverride] = useState<string | null>(null);
  const dueLocal = dueLocalOverride ?? dueLocalFromCard;
  const setDueLocal = useCallback((value: string) => {
    setDueLocalOverride(value);
  }, []);
  const handleDuePickerOpenedChange = useCallback((next: boolean) => {
    setDuePickerOpened(next);
    if (!next) {
      setDueLocalOverride(null);
    }
  }, []);
  const showDueDateAndReminders = boardSettings?.showDueDateAndReminders !== false;
  const showLabels = boardSettings?.showLabels !== false;
  const showAssignees = boardSettings?.showAssignees !== false;
  const showChecklist = boardSettings?.showChecklist !== false;
  const showAttachments = boardSettings?.showAttachments !== false;
  const showComments = boardSettings?.showComments !== false;

  const { can, loaded: boardPermsLoaded } = useBoardPermissions(boardId, boardWorkspaceId);
  const canDeleteCard = boardPermsLoaded && can('cards.delete');
  const canDuplicateCard = boardPermsLoaded && can('cards.duplicate');
  const canCreateComments = boardPermsLoaded && can('comments.create');
  const canDeleteOthersComments = boardPermsLoaded && can('comments.delete');

  const syncCardToBoardAndDexie = useCallback(
    (next: CardDB) => {
      setCard(next);
      onCardUpdated?.(next);
      void db.cards.put(next);
    },
    [onCardUpdated],
  );

  const parsedDescription = useMemo(() => parseCardDescriptionJson(card.description), [card.description]);
  const isDescriptionEmpty = isCardDescriptionEmpty(parsedDescription);

  useEffect(() => {
    setDueLocalOverride(null);
  }, [dueTimeKey]);

  useEffect(() => {
    const current = cardRef.current;
    if (initialCard.id !== current.id) {
      setCard(initialCard);
      setTitle(initialCard.title);
      return;
    }
    if (!isEditing && !isEditingDescription) {
      if (shouldAcceptIncomingCard(current, initialCard)) {
        setCard(initialCard);
        setTitle(initialCard.title);
      }
    }
  }, [initialCard, isEditing, isEditingDescription]);

  const handleUpdateTitle = async () => {
    if (title.trim() === card.title) {
      setIsEditing(false);
      return;
    }

    const next = title.trim();
    if (next.length > CARD_TITLE_MAX_LENGTH) {
      notifications.show({
        color: 'red',
        title: 'Title too long',
        message: `Title cannot exceed ${CARD_TITLE_MAX_LENGTH} characters.`,
      });
      return;
    }
    if (!next) {
      notifications.show({
        color: 'red',
        title: 'Title required',
        message: 'Card title cannot be empty.',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await api.updateCard(card.id, { title: next });
      try {
        syncCardToBoardAndDexie(normalizeCardFromApi((response as { card: unknown }).card, card.id));
      } catch {
        notifications.show({
          color: 'red',
          title: 'Update failed',
          message: 'Could not read updated card from server.',
        });
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating card title:', error);
      setTitle(card.title);
    } finally {
      setLoading(false);
    }
  };

  const onDescriptionEditorReady = useCallback((ed: Editor | null) => {
    descriptionEditorRef.current = ed;
  }, []);

  const onBeforeDeleteAttachment = useCallback(
    async (attachmentId: string): Promise<void> => {
      const c = cardRef.current;
      const att = c.attachments.find((a) => a.id === attachmentId);
      if (att == null) {
        return;
      }
      const referencedInSavedDescription = collectReferencedAttachmentIdsFromDescriptionJson(
        c.description ?? '',
        c.attachments,
      ).has(attachmentId);
      const referencedInLiveEditor = ((): boolean => {
        const ed = descriptionEditorRef.current;
        if (ed == null || ed.isDestroyed) {
          return false;
        }
        const ser = serializeCardDescriptionEditor(ed);
        if (!ser.ok) {
          return false;
        }
        return collectReferencedAttachmentIdsFromDescriptionJson(ser.jsonString, c.attachments).has(
          attachmentId,
        );
      })();
      const isCover = cardCoverReferencesAttachment(c.cover, attachmentId, att.url);
      if ((!referencedInSavedDescription && !referencedInLiveEditor) || !isCover) {
        return;
      }

      const rawJsonForStrip = ((): string => {
        const ed = descriptionEditorRef.current;
        if (ed != null && !ed.isDestroyed) {
          const ser = serializeCardDescriptionEditor(ed);
          if (ser.ok) {
            return ser.jsonString;
          }
        }
        return c.description ?? '';
      })();

      const stripped = stripAttachmentFromDescriptionJsonString(
        rawJsonForStrip,
        attachmentId,
        att.url,
      );
      const doc = parseCardDescriptionJson(stripped);
      const isEmpty = isCardDescriptionEmpty(doc);
      const descriptionPayload = isEmpty ? '' : stripped;

      const response = await api.updateCard(c.id, {
        description: descriptionPayload,
        cover: '',
      });
      const normalized = normalizeCardFromApi((response as { card: unknown }).card, c.id);
      const ed = descriptionEditorRef.current;
      if (ed != null && !ed.isDestroyed) {
        ed.commands.setContent(parseCardDescriptionJson(descriptionPayload));
      }
      syncCardToBoardAndDexie(normalized);
    },
    [syncCardToBoardAndDexie],
  );

  const handleUpdateDescription = async () => {
    const serialized = serializeCardDescriptionEditor(descriptionEditorRef.current);
    if (!serialized.ok) {
      notifications.show({
        color: 'red',
        title: 'Description',
        message: serialized.reason,
      });
      return;
    }
    const doc = parseCardDescriptionJson(serialized.jsonString);
    const isEmpty = isCardDescriptionEmpty(doc);

    const descriptionPayload = isEmpty ? '' : serialized.jsonString;
    const previousAttachmentIds = collectReferencedAttachmentIdsFromDescriptionJson(
      card.description ?? '',
      card.attachments,
    );
    const nextAttachmentIds = collectReferencedAttachmentIdsFromDescriptionJson(
      isEmpty ? '' : serialized.jsonString,
      card.attachments,
    );
    const attachmentIdsRemovedFromDescription = [...previousAttachmentIds].filter(
      (id) => !nextAttachmentIds.has(id),
    );

    setLoading(true);
    try {
      const updateData: {
        description?: string;
      } = {};
      updateData.description = descriptionPayload;
      const response = await api.updateCard(card.id, updateData);

      for (const attachmentId of attachmentIdsRemovedFromDescription) {
        try {
          await api.deleteCardAttachment(card.id, attachmentId);
        } catch (err) {
          console.error('Failed to delete attachment unreferenced by description:', err);
        }
      }

      let normalized = normalizeCardFromApi((response as { card: unknown }).card, card.id);
      if (attachmentIdsRemovedFromDescription.length > 0) {
        try {
          const refresh = await api.getCard(card.id);
          normalized = normalizeCardFromApi((refresh as { card: unknown }).card, card.id);
        } catch (err) {
          console.error('Failed to refresh card after attachment cleanup:', err);
        }
      }

      try {
        syncCardToBoardAndDexie(normalized);
      } catch {
        notifications.show({
          color: 'red',
          title: 'Update failed',
          message: 'Could not read updated card from server.',
        });
      }
      setIsEditingDescription(false);
    } catch (error) {
      console.error('Error updating card description:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDueDate = useCallback(async () => {
    if (!dueLocal.trim()) {
      notifications.show({
        color: 'yellow',
        title: 'Due date',
        message: 'Choose a date and time.',
      });
      return;
    }
    const parsed = new Date(dueLocal);
    if (Number.isNaN(parsed.getTime())) {
      notifications.show({
        color: 'red',
        title: 'Invalid date',
        message: 'Could not read that date.',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await api.updateCard(card.id, { dueDate: parsed.toISOString() });
      try {
        syncCardToBoardAndDexie(normalizeCardFromApi((response as { card: unknown }).card, card.id));
      } catch {
        notifications.show({
          color: 'red',
          title: 'Update failed',
          message: 'Could not read updated card from server.',
        });
      }
      handleDuePickerOpenedChange(false);
    } catch (error) {
      console.error('Error updating due date:', error);
      notifications.show({
        color: 'red',
        title: 'Could not save due date',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [card.id, dueLocal, syncCardToBoardAndDexie, handleDuePickerOpenedChange]);

  const handleClearDueDate = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await api.updateCard(card.id, { dueDate: null });
      try {
        syncCardToBoardAndDexie(normalizeCardFromApi((response as { card: unknown }).card, card.id));
      } catch {
        notifications.show({
          color: 'red',
          title: 'Update failed',
          message: 'Could not read updated card from server.',
        });
      }
      handleDuePickerOpenedChange(false);
    } catch (error) {
      console.error('Error clearing due date:', error);
      notifications.show({
        color: 'red',
        title: 'Could not clear due date',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [card.id, syncCardToBoardAndDexie, handleDuePickerOpenedChange]);

  const handleDeleteCard = () => {
    modals.openConfirmModal({
      title: 'Delete card',
      children: (
        <Text size="sm">
          This card will be permanently deleted, including comments, checklists, and attachments.
        </Text>
      ),
      labels: { confirm: 'Delete card', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setLoading(true);
        try {
          await api.deleteCard(card.id);
          await db.cards.delete(card.id);
          onCardDeleted?.();
          onClose();
        } catch (error) {
          console.error('Error deleting card:', error);
          notifications.show({
            color: 'red',
            title: 'Could not delete card',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <>
      <Modal
        opened={true}
        onClose={onClose}
        size="54vw"
        transitionProps={{ duration: 0 }}
        overlayProps={{ backgroundOpacity: 0.55, blur: 0 }}
        title={
          isEditing ? (
            <TextInput
              size="md"
              fw={700}
              variant="unstyled"
              value={title}
              maxLength={CARD_TITLE_MAX_LENGTH}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onBlur={handleUpdateTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleUpdateTitle();
                }
                if (e.key === 'Escape') {
                  setTitle(card.title);
                  setIsEditing(false);
                }
              }}
              autoFocus
              disabled={loading}
            />
          ) : (
            <Text
              style={{
                cursor: 'pointer',
                lineHeight: 1.25,
                fontFamily: 'var(--kb-app-ui-font-family)',
                fontWeight: 600,
                fontSize: '1.6rem',
              }}
              onClick={() => setIsEditing(true)}
            >
              <TwemojiPlainText text={card.title} />
            </Text>
          )
        }
        centered
        closeButtonProps={{ 'aria-label': 'Close' }}
        withCloseButton
        styles={{
          body: {
            padding: 0,
            backgroundColor: '#f8f9fb',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          },
          content: {
            width: '54vw',
            minWidth: '44vw',
            maxWidth: '62vw',
            height: 'calc(100vh - 24px)',
            minHeight: 'calc(100vh - 24px)',
            maxHeight: 'calc(100vh - 24px)',
            backgroundColor: '#f8f9fb',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
          header: { backgroundColor: '#f8f9fb', alignItems: 'center' },
          title: { flex: 1, marginRight: 'var(--mantine-spacing-sm)' },
        }}
      >
        <Stack gap={0} style={{ minHeight: 0, flex: 1 }}>
          <Divider color="gray.3" />
          <ScrollArea
            type="auto"
            offsetScrollbars
            style={{ flex: '1 1 0%', minHeight: 0, maxHeight: '100%' }}
          >
            <Box px="md" py="md">
              <Stack gap="lg" pr="xs">
              <Box>
                <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap">
                    <IconAlignLeft size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
                    <Text {...cardDetailSectionTitleProps}>Description</Text>
                  </Group>
                  {!isEditingDescription && (
                    <Button
                      size="sm"
                      variant="default"
                      leftSection={<IconPencil size={14} />}
                      styles={cardDetailSoftButtonStyles}
                      onClick={() => setIsEditingDescription(true)}
                    >
                      Edit
                    </Button>
                  )}
                </Group>
                {isEditingDescription ? (
                  <Box
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-md)',
                      overflow: 'hidden',
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
                        key={`${card.id}-desc-edit`}
                        cardId={card.id}
                        valueJson={card.description}
                        placeholder="Add a description…"
                        minHeightPx={280}
                        onEditorReady={onDescriptionEditorReady}
                      />
                    </Suspense>
                    <Group justify="flex-start" gap="xs" p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-1)' }}>
                      <Button
                        size="sm"
                        color="blue"
                        onClick={handleUpdateDescription}
                        disabled={loading}
                        loading={loading}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          setIsEditingDescription(false);
                        }}
                        disabled={loading}
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
                      cursor: 'pointer',
                    }}
                    onClick={() => setIsEditingDescription(true)}
                  >
                    {isDescriptionEmpty ? (
                      <Text {...cardDetailEmptyStateProps}>
                        Click to add a description…
                      </Text>
                    ) : (
                      <CardDescriptionReadonly valueJson={card.description} valueHtml={card.descriptionHtml} />
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
                  card={card}
                  boardId={boardId}
                  loading={loading}
                  showDueDateAndReminders={showDueDateAndReminders}
                  showLabels={showLabels}
                  showAssignees={showAssignees}
                  showChecklist={showChecklist}
                  showAttachments={showAttachments}
                  showComments={showComments}
                  canCreateComments={canCreateComments}
                  canDeleteOthersComments={canDeleteOthersComments}
                  dueLocal={dueLocal}
                  setDueLocal={setDueLocal}
                  duePickerOpened={duePickerOpened}
                  setDuePickerOpened={handleDuePickerOpenedChange}
                  syncCardToBoardAndDexie={syncCardToBoardAndDexie}
                  onBeforeDeleteAttachment={onBeforeDeleteAttachment}
                  onSaveDueDate={handleSaveDueDate}
                  onClearDueDate={handleClearDueDate}
                />
              </Suspense>
              </Stack>
            </Box>
          </ScrollArea>

          {canDeleteCard || canDuplicateCard ? (
            <Group
              justify="space-between"
              align="center"
              gap="sm"
              wrap="wrap"
              px="md"
              py="sm"
              style={{
                flexShrink: 0,
                backgroundColor: '#f8f9fb',
                borderTop: '1px solid var(--mantine-color-gray-3)',
              }}
            >
              {canDeleteCard ? (
                <Button
                  color="red"
                  variant="filled"
                  leftSection={<IconTrash size={16} />}
                  onClick={handleDeleteCard}
                  disabled={loading}
                >
                  Delete Card
                </Button>
              ) : null}
              {canDuplicateCard ? (
                <Button
                  size="sm"
                  variant="default"
                  styles={cardDetailSoftButtonStyles}
                  onClick={() => setShowDuplicateModal(true)}
                >
                  Duplicate Card
                </Button>
              ) : null}
            </Group>
          ) : null}
        </Stack>
      </Modal>

      {showDuplicateModal && (
        <DuplicateCardModal
          cardId={card.id}
          currentListId={listId}
          boardId={boardId}
          onClose={() => setShowDuplicateModal(false)}
          onSuccess={() => {
            if (onCardDuplicated) {
              onCardDuplicated();
            }
          }}
        />
      )}
    </>
  );
}
