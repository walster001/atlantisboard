import { useCallback, useLayoutEffect, useMemo, useState, type MutableRefObject } from 'react';
import { Box, Button, Text } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import type { BoardDB, CardDB } from '../../../store/database.js';
import type { KanbanBoardEditCaps } from '../../../hooks/useBoardPermissions.js';
import { useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import { patchCardInRuntime } from '../KanbanView/kanbanViewStoreActions.js';
import { buildStorytellingSections } from './visualStorytellingModel.js';
import { VisualStorytellingSection } from './VisualStorytellingSection.js';
import { VisualStorytellingAddHero } from './VisualStorytellingAddHero.js';
import {
  addStorytellingContent,
  addStorytellingHero,
  showStorytellingError,
} from './visualStorytellingActions.js';
import { useStoryboardLightbox } from './useStoryboardLightbox.js';
import { useStoryboardImageUpload } from './useStoryboardImageUpload.js';
import './visualStorytelling.css';

export interface VisualStorytellingViewProps {
  readonly board: BoardDB;
  readonly kanbanCaps: KanbanBoardEditCaps;
  readonly onOpenCard: (card: CardDB) => void;
  readonly boardCardPatchRef?: MutableRefObject<((card: CardDB) => void) | null>;
}

export function VisualStorytellingView({
  board,
  kanbanCaps,
  onOpenCard,
  boardCardPatchRef,
}: VisualStorytellingViewProps) {
  const { orderedListIds, listsById, cardsById, cardIdsByListId } = useBoardRuntimeStore(
    useShallow((state) => ({
      orderedListIds: state.orderedListIds,
      listsById: state.listsById,
      cardsById: state.cardsById,
      cardIdsByListId: state.cardIdsByListId,
    })),
  );
  const sections = useMemo(
    () =>
      buildStorytellingSections(
        orderedListIds
          .map((id) => listsById[id])
          .filter((list): list is NonNullable<typeof list> => list != null),
        cardsById,
        cardIdsByListId,
      ),
    [orderedListIds, listsById, cardsById, cardIdsByListId],
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = kanbanCaps.canAddCard;

  const patchCard = useCallback((card: CardDB) => {
    patchCardInRuntime(card);
  }, []);

  useLayoutEffect(() => {
    if (boardCardPatchRef == null) {
      return undefined;
    }
    boardCardPatchRef.current = patchCard;
    return () => {
      boardCardPatchRef.current = null;
    };
  }, [boardCardPatchRef, patchCard]);

  const lightbox = useStoryboardLightbox();
  const upload = useStoryboardImageUpload({ canEdit, onCardUpdate: patchCard });
  const mediaBusy = busy || upload.uploading;

  const run = useCallback(async (work: () => Promise<void>, fallback: string): Promise<void> => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      showStorytellingError(error, fallback);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleAddContent = (listId: string): void => {
    const current = sections.find((row) => row.list.id === listId);
    const nextPosition = (current?.hero != null ? 1 : 0) + (current?.content.length ?? 0);
    void run(async () => {
      const file = await upload.pickImageFile();
      if (file == null) {
        return;
      }
      await addStorytellingContent({
        boardId: board.id,
        listId,
        nextPosition,
        file,
        uploadImageToCard: upload.uploadImageToCard,
      });
    }, 'Could not add content');
  };

  const handlePickHeroImage = (listId: string): void => {
    const current = sections.find((row) => row.list.id === listId);
    void run(async () => {
      const file = await upload.pickImageFile();
      if (file == null) {
        return;
      }
      const heroCard = current?.hero;
      if (heroCard != null) {
        await upload.uploadImageToCard(heroCard.id, file);
        return;
      }
      await addStorytellingHero({
        boardId: board.id,
        sections,
        draft: { title: current?.list.name.trim() || 'Hero', caption: '', files: [file] },
        uploadImageToCard: upload.uploadImageToCard,
      });
    }, 'Could not add hero image');
  };

  return (
    <Box className="vs-board">
      {upload.fileInputNode}
      {lightbox.lightboxNode}
      {sections.length === 0 ? (
        <Text className="vs-empty">Add a hero to start this storyboard.</Text>
      ) : null}
      {sections.map((section) => (
        <VisualStorytellingSection
          key={section.list.id}
          list={section.list}
          hero={section.hero}
          content={section.content}
          canAddCard={kanbanCaps.canAddCard}
          canEdit={canEdit}
          busy={mediaBusy}
          onOpenCard={onOpenCard}
          onImageClick={lightbox.openCardImage}
          onAddContent={handleAddContent}
          onPickHeroImage={handlePickHeroImage}
        />
      ))}
      {kanbanCaps.canAddList ? (
        composerOpen ? (
          <VisualStorytellingAddHero
            busy={mediaBusy}
            onCancel={() => setComposerOpen(false)}
            onSubmit={async (draft) => {
              await run(async () => {
                await addStorytellingHero({
                  boardId: board.id,
                  sections,
                  draft,
                  uploadImageToCard: upload.uploadImageToCard,
                });
                setComposerOpen(false);
              }, 'Could not add hero');
            }}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            color="gray"
            radius="xl"
            className="vs-add-hero-open"
            disabled={mediaBusy}
            onClick={() => setComposerOpen(true)}
          >
            + Add Hero
          </Button>
        )
      ) : null}
    </Box>
  );
}
